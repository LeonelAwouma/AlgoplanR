#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Harmonisation des 2 bases MINEDUB selon les 2 schemas AlgoPlanR.

Entrées :
  - BD Ecoles primaires publiques 2024_2025 Actual.xlsx (onglet BD Manuel)
  - CARTO_MINEDUB.xlsx (onglet Carto_Minedub)
Références (colonnes reprises exactement) :
  - etablissements_national.xlsx
  - enseignants_national.xlsx

Sorties (dans --sortie) :
  - etablissements_national_formates.xlsx
  - enseignants_national_formates.xlsx
  - deux variantes .csv (UTF-8, séparateur point-virgule)
  - rapport_harmonisation.txt
  - enseignants_non_rattaches.csv

IMPORTANT : les modèles de référence possèdent des données fictives de démonstration ;
leurs lignes ne sont pas mélangées aux données sources. Les identifiants sources sont
conservés. Les champs absents ne sont pas inventés.

Différences avec la version d'origine (formater.py) :
  - second passage de rattachement des personnels aux écoles, tolérant aux variantes de graphie
    (GR 2 / GROUPE II / G2, chiffres romains, EPA / EP APPLICATION, particules « DE », « DU »…).
    Il n'est tenté qu'en l'absence de toute correspondance exacte et n'accepte qu'un candidat UNIQUE
    dans le département puis dans la région : jamais de rattachement par approximation floue.
  - Sous_Systeme_Formation renseigné par la langue d'expression (Francophone / Anglophone), par défaut ;
    --no-langue-comme-sous-systeme pour le laisser vide (l'application le déduit alors de l'école d'attache).

Python 3.9+ ; aucune bibliothèque tierce nécessaire.

Exemple :
  python formater_minedub.py --ecoles ... --personnels ... --sortie ...
  python formater_minedub.py --date-reference 2026-10-19
  python formater_minedub.py --remplir-salles-simple-flux --remplir-enseignants-actuels
  python formater_minedub.py --no-langue-comme-sous-systeme
"""
from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from html import escape
import math
from pathlib import Path
import posixpath
import tempfile
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
M = '{' + NS_MAIN + '}'
RID = '{' + NS_REL_DOC + '}id'

COLS_ECOLES = [
    'Identifiant_Ecole', 'nom_etab', 'Sous_Systeme', 'Region',
    'Departement', 'Commune', 'Circonscription_IAEB', 'Arrondissement',
    'Accessibilite_Zone', 'Securite_Zone', 'Effectif_Eleves_Attendus',
    'Salles_Simple_Flux', 'Salles_Double_Flux', 'Classes_Multigrades',
    'latitude', 'longitude', 'Enseignants_Actuels',
]
COLS_ENSEIGNANTS = [
    'Matricule_Enseignant', 'nom', 'prenom', 'Statut', 'Paye_Par_Etat',
    'Sous_Systeme_Formation', 'Ecole_Attache_Actuelle', 'Age',
    'Anciennete_Carriere', 'Anciennete_Poste_Actuel',
    'Annees_Zone_Difficulte_1', 'Annees_Zone_Difficulte_2',
    'Situation_Matrimoniale', 'Nombre_Enfants_A_Charge',
    'Formations_Continues', 'Voeu_1', 'Voeu_2', 'Voeu_3',
    'Motif_Bonification',
]
COLS_EFFECTIFS = [
    'EFF SIL/ Class 1', 'EFF CP/ Class 2', 'EFF CE 1/ Class 3',
    'EFF CE 2/ Class 4', 'EFF CM I/ Class V', 'EFF CM II/ Class VI',
]


def propre(valeur) -> str:
    return re.sub(r'\s+', ' ', str(valeur or '').replace('\u00a0', ' ')).strip()


def cle(valeur) -> str:
    texte = unicodedata.normalize('NFKD', propre(valeur))
    texte = ''.join(c for c in texte if not unicodedata.combining(c))
    return re.sub(r'[^A-Z0-9]', '', texte.upper())


def region_standard(valeur) -> str:
    code = cle(valeur)
    correspondance = {
        'ADAMAOUA': 'Adamaoua', 'CENTRE': 'Centre', 'EST': 'Est',
        'EXTREMENORD': 'Extrême-Nord', 'LITTORAL': 'Littoral',
        'NORD': 'Nord', 'NORDOUEST': 'Nord-Ouest', 'OUEST': 'Ouest',
        'SUD': 'Sud', 'SUDOUEST': 'Sud-Ouest',
    }
    return correspondance.get(code, propre(valeur))


def nombre(valeur):
    txt = propre(valeur).replace(' ', '').replace(',', '.')
    if not txt or txt in {'-', '/', '//'}:
        return None
    try:
        v = float(txt)
        if not math.isfinite(v):
            return None
        return int(v) if v.is_integer() else v
    except (TypeError, ValueError):
        return None


def lire_date(valeur):
    txt = propre(valeur)
    if not txt or txt in {'/', '//', '-', '0'}:
        return None
    for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%Y/%m/%d',
                '%d/%m/%y', '%d-%m-%y'):
        try:
            return datetime.strptime(txt, fmt).date()
        except ValueError:
            pass
    # Certains exports Excel enregistrent une date en numéro de série.
    numerique = nombre(txt)
    if isinstance(numerique, (int, float)) and 1 <= numerique <= 100000:
        try:
            return date(1899, 12, 30) + timedelta(days=int(numerique))
        except (OverflowError, ValueError):
            pass
    return None


def annees_revolues(debut: date, fin: date) -> int:
    return fin.year - debut.year - ((fin.month, fin.day) < (debut.month, debut.day))


def situation_familiale(valeur):
    v = cle(valeur)
    return {
        'MARIEE': 'Marié', 'MARIE': 'Marié', 'CELIBATAIRE': 'Célibataire',
        'DIVORCEE': 'Divorcé', 'DIVORCE': 'Divorcé', 'VEUVE': 'Veuf/Veuve',
        'VEUF': 'Veuf/Veuve',
    }.get(v, propre(valeur) or None)


_ROMAINS = {'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8',
            'IX': '9', 'X': '10'}


def cle_tolerante(nom) -> str:
    """Clé de rapprochement tolérante pour un nom d'école : groupes, chiffres romains, EPA, particules."""
    texte = unicodedata.normalize('NFKD', propre(nom).upper().rstrip('.'))
    texte = ''.join(c for c in texte if not unicodedata.combining(c))
    texte = re.sub(r'[^A-Z0-9]+', ' ', texte)
    texte = re.sub(r'\b(GROUPE|GRP|GRPE|GR|G)\s*([IVX]+|\d+)\b', lambda r: 'GR ' + r.group(2), texte)
    texte = ' '.join(_ROMAINS.get(mot, mot) for mot in texte.split())
    texte = re.sub(r'^(EPA|EPPA)\b', 'EP APPLICATION', texte)
    texte = re.sub(r'\b(DU|DE|DES|LA|LE|L)\b', ' ', texte)
    return re.sub(r'\s+', '', texte)


def sous_systeme_langue(valeur):
    return {'FRANCAIS': 'Francophone', 'ANGLAIS': 'Anglophone'}.get(cle(valeur))


class LecteurXlsx:
    """Lecture incrémentale des lignes XLSX via la bibliothèque standard."""

    def __init__(self, chemin: Path):
        self.zip = zipfile.ZipFile(chemin, 'r')
        self.strings = []
        if 'xl/sharedStrings.xml' in self.zip.namelist():
            with self.zip.open('xl/sharedStrings.xml') as f:
                for _, elem in ET.iterparse(f, events=('end',)):
                    if elem.tag == M + 'si':
                        self.strings.append(''.join(t.text or '' for t in elem.iter(M + 't')))
                        elem.clear()
        wb = ET.fromstring(self.zip.read('xl/workbook.xml'))
        rels = ET.fromstring(self.zip.read('xl/_rels/workbook.xml.rels'))
        cibles = {e.get('Id'): e.get('Target') for e in rels}
        self.onglets = {}
        for sh in wb.iter(M + 'sheet'):
            chemin_xml = cibles[sh.get(RID)]
            if chemin_xml.startswith('/'):
                chemin_xml = chemin_xml.lstrip('/')
            else:
                chemin_xml = posixpath.normpath(posixpath.join('xl', chemin_xml))
            self.onglets[sh.get('name')] = chemin_xml

    def lignes(self, onglet: str):
        if onglet not in self.onglets:
            raise ValueError(f"Onglet {onglet!r} introuvable : {list(self.onglets)}")
        with self.zip.open(self.onglets[onglet]) as f:
            for _, elem in ET.iterparse(f, events=('end',)):
                if elem.tag != M + 'row':
                    continue
                ligne = {}
                for c in elem.findall(M + 'c'):
                    ref = re.match(r'[A-Z]+', c.get('r', ''))
                    if not ref:
                        continue
                    pos = 0
                    for lettre in ref.group():
                        pos = pos * 26 + ord(lettre) - 64
                    value = c.find(M + 'v')
                    typ = c.get('t')
                    if typ == 'inlineStr':
                        resultat = ''.join(t.text or '' for t in c.iter(M + 't'))
                    elif value is None:
                        resultat = ''
                    elif typ == 's':
                        resultat = self.strings[int(value.text)]
                    elif typ == 'b':
                        resultat = 'Oui' if value.text == '1' else 'Non'
                    else:
                        resultat = value.text or ''
                    ligne[pos - 1] = propre(resultat)
                yield ligne
                elem.clear()

    def dictionnaires(self, onglet: str):
        it = self.lignes(onglet)
        entete = next(it)
        noms = {k: propre(v) for k, v in entete.items() if propre(v)}
        for ligne in it:
            yield {name: ligne.get(idx, '') for idx, name in noms.items()}

    def fermer(self):
        self.zip.close()


def lettre_colonne(index: int) -> str:
    resultat = ''
    while index > 0:
        index, r = divmod(index - 1, 26)
        resultat = chr(65 + r) + resultat
    return resultat


def xml_texte(valeur) -> str:
    # Les caractères de contrôle ASCII sont interdits dans XML 1.0.
    texte = ''.join(ch for ch in str(valeur) if ord(ch) >= 32 or ch in '\t\n\r')
    return escape(texte, quote=False)


class EcrivainXlsx:
    """Création XLSX en flux (ne conserve pas un million de cellules en RAM)."""

    def __init__(self, chemin: Path, colonnes: list[str]):
        self.colonnes = colonnes
        self.csv_file = chemin.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='')
        self.csv_writer = csv.writer(self.csv_file, delimiter=';')
        self.zip = zipfile.ZipFile(chemin, 'w', zipfile.ZIP_DEFLATED, compresslevel=4)
        self.nb = 0
        contenu = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''
        self.zip.writestr('[Content_Types].xml', contenu)
        self.zip.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')
        self.zip.writestr('xl/workbook.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>''')
        self.zip.writestr('xl/_rels/workbook.xml.rels', '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''')
        self.zip.writestr('xl/styles.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF16324F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>''')
        # Ecrit le XML temporairement sur disque pour que ZIP connaisse sa taille
        # et produise des entetes ZIP standards (sans ZIP64 force).
        # Certains importateurs JavaScript echouent sur ZIP64 (allocation de buffer).
        fd, self._temp_xml = tempfile.mkstemp(prefix='minedub_sheet_', suffix='.xml', dir=str(chemin.parent))
        self.f = os.fdopen(fd, 'wb')
        largeurs = ''.join(
            f'<col min="{i}" max="{i}" width="{40 if len(nom)>25 else 24}" customWidth="1"/>'
            for i, nom in enumerate(colonnes, 1)
        )
        self.ecrire_brut(f'''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/><cols>{largeurs}</cols><sheetData>''')
        self._ligne(colonnes, entete=True)

    def ecrire_brut(self, texte: str):
        self.f.write(texte.encode('utf-8'))

    def _ligne(self, valeurs, entete=False):
        self.nb += 1
        self.csv_writer.writerow(['' if val is None else val for val in valeurs])
        cellules = []
        for idx, valeur in enumerate(valeurs, 1):
            if valeur is None or valeur == '':
                continue
            ref = f'{lettre_colonne(idx)}{self.nb}'
            style = ' s="1"' if entete else ''
            if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
                cellules.append(f'<c r="{ref}"{style} t="n"><v>{valeur}</v></c>')
            else:
                cellules.append(f'<c r="{ref}"{style} t="inlineStr"><is><t xml:space="preserve">{xml_texte(valeur)}</t></is></c>')
        self.ecrire_brut(f'<row r="{self.nb}">{"".join(cellules)}</row>')

    def ajouter(self, valeurs):
        if len(valeurs) != len(self.colonnes):
            raise ValueError('La ligne ne respecte pas le nombre de colonnes cible')
        self._ligne(valeurs)

    def fermer(self):
        derniere = lettre_colonne(len(self.colonnes))
        self.ecrire_brut(f'</sheetData><autoFilter ref="A1:{derniere}{self.nb}"/></worksheet>')
        self.f.close()
        self.csv_file.close()
        try:
            self.zip.write(self._temp_xml, arcname='xl/worksheets/sheet1.xml', compress_type=zipfile.ZIP_DEFLATED, compresslevel=4)
        finally:
            self.zip.close()
            os.unlink(self._temp_xml)


def charger_ecoles(chemin: Path):
    fichier = LecteurXlsx(chemin)
    ecoles = []
    index = [defaultdict(set) for _ in range(5)]
    anomalies = Counter()
    codes_vus = set()
    try:
        for source in fichier.dictionnaires('BD Manuel'):
            code = propre(source.get('CODE_ETABLISSEMENT'))
            nom = propre(source.get('NOM_ECOLE')).rstrip('.')
            if not code or not nom:
                anomalies['ecoles_sans_code_ou_nom'] += 1
                continue
            if code in codes_vus:
                anomalies['codes_ecoles_en_double'] += 1
                # On ne supprime aucune ligne ; la jointure par nom reste stricte.
            codes_vus.add(code)
            effectifs = [nombre(source.get(col)) for col in COLS_EFFECTIFS]
            invalides = [col for col in COLS_EFFECTIFS
                         if propre(source.get(col)) and nombre(source.get(col)) is None]
            if invalides:
                anomalies['ecoles_effectifs_invalides'] += 1
            total = (sum(n for n in effectifs if n is not None)
                     if any(n is not None for n in effectifs) and not invalides else None)
            if total == 0 and cle(source.get('FONCTIONNALITE')) != 'FONCTIONNELLE':
                # Ecole fermee / non fonctionnelle : 0 = « non renseigne », pas « aucun eleve attendu ».
                total = None
                anomalies['ecoles_non_fonctionnelles_effectif_vide'] += 1
            nom_milieu = propre(source.get('MILIEU'))
            access = {'RURAL': 'Rural', 'URBAIN': 'Urbain', 'URBAN': 'Urbain'}.get(cle(nom_milieu))
            if access is None and nom_milieu:
                access = nom_milieu
            item = {
                'Identifiant_Ecole': code,
                'nom_etab': nom,
                'Sous_Systeme': propre(source.get('SOUS_SYSTEME')) or None,
                'Region': region_standard(source.get('REGION')),
                'Departement': propre(source.get('DEPARTEMENT')) or None,
                'Commune': None,  # Arrondissement != nécessairement commune.
                'Circonscription_IAEB': propre(source.get('ARRONDISSEMENT')) or None,  # 1 arrondissement = 1 IAEB.
                'Arrondissement': propre(source.get('ARRONDISSEMENT')) or None,
                'Accessibilite_Zone': access,  # Milieu, sans inférer l'enclavement.
                'Securite_Zone': None,
                'Effectif_Eleves_Attendus': total,  # Proxy : inscrits 2024-2025.
                'Salles_Simple_Flux': None,  # Le nombre total de salles != simple flux.
                'Salles_Double_Flux': None,
                'Classes_Multigrades': None,
                'latitude': None,
                'longitude': None,
                'Enseignants_Actuels': None,
                '_S4_SALLES_TOTAL': nombre(source.get('S4_SALLES_TOTAL')),
                '_FONCTIONNALITE': propre(source.get('FONCTIONNALITE')),
            }
            pos = len(ecoles)
            ecoles.append(item)
            reg = cle(source.get('REGION'))
            dep = cle(source.get('DEPARTEMENT'))
            arr = cle(source.get('ARRONDISSEMENT'))
            structure = cle(nom)
            if reg and dep and structure:
                if arr: index[0][(reg, dep, arr, structure)].add(pos)
                index[1][(reg, dep, structure)].add(pos)
                index[2][(reg, structure)].add(pos)
                souple = cle_tolerante(nom)
                index[3][(reg, dep, souple)].add(pos)
                index[4][(reg, souple)].add(pos)
    finally:
        fichier.fermer()
    return ecoles, index, anomalies


def identifier_ecole(source, index):
    reg, dep = cle(source.get('Region')), cle(source.get('departement'))
    arr, nom = cle(source.get('arrondissement')), cle(source.get('Structure éducative'))
    if not reg or not nom:
        return None, 'informations_insuffisantes'
    essais = [
        (0, (reg, dep, arr, nom), bool(dep and arr)),
        (1, (reg, dep, nom), bool(dep)),
        (2, (reg, nom), True),
    ]
    ambigu = False
    for niveau, key, pertinent in essais:
        if not pertinent:
            continue
        possibilites = index[niveau].get(key, set())
        if len(possibilites) == 1:
            return next(iter(possibilites)), f'correspondance_niveau_{niveau}'
        if len(possibilites) > 1:
            ambigu = True
    if not ambigu:
        # Second passage, seulement sans aucune correspondance exacte : graphies voisines, candidat unique.
        souple = cle_tolerante(source.get('Structure éducative'))
        for niveau, key, pertinent in ((3, (reg, dep, souple), bool(dep)), (4, (reg, souple), True)):
            if not pertinent:
                continue
            possibilites = index[niveau].get(key, set())
            if len(possibilites) == 1:
                return next(iter(possibilites)), f'correspondance_niveau_{niveau}'
            if len(possibilites) > 1:
                return None, 'correspondance_ambigue'
    return None, 'correspondance_ambigue' if ambigu else 'aucune_correspondance'


def traiter_enseignants(chemin: Path, ecoles, index, destination: Path, rapport_csv: Path, aujourd_hui: date,
                        langue_comme_sous_systeme: bool = False):
    nombres = Counter()
    rattaches = Counter()
    fichier = LecteurXlsx(chemin)
    sortie = EcrivainXlsx(destination, COLS_ENSEIGNANTS)
    try:
        with rapport_csv.open('w', newline='', encoding='utf-8-sig') as f:
            champ = ['ID_personnel', 'Region', 'Departement', 'Arrondissement',
                     'Structure_educative', 'Raison_non_rattachement']
            anomalie_writer = csv.DictWriter(f, fieldnames=champ, delimiter=';')
            anomalie_writer.writeheader()
            for src in fichier.dictionnaires('Carto_Minedub'):
                identifiant = propre(src.get('ID'))
                if not identifiant:
                    nombres['personnels_sans_id_ignores'] += 1
                    continue
                pos, raison = identifier_ecole(src, index)
                if pos is not None:
                    code_ecole = ecoles[pos]['Identifiant_Ecole']
                    rattaches[pos] += 1
                    nombres[raison] += 1
                else:
                    code_ecole = None
                    nombres[raison] += 1
                    anomalie_writer.writerow({
                        'ID_personnel': identifiant,
                        'Region': propre(src.get('Region')),
                        'Departement': propre(src.get('departement')),
                        'Arrondissement': propre(src.get('arrondissement')),
                        'Structure_educative': propre(src.get('Structure éducative')),
                        'Raison_non_rattachement': raison,
                    })
                naissance = lire_date(src.get('Date de naissance'))
                age = annees_revolues(naissance, aujourd_hui) if naissance and naissance <= aujourd_hui else None
                if age is not None and not 18 <= age <= 100:
                    age = None
                if age is None:
                    nombres['age_non_calculable'] += 1
                entree = lire_date(src.get("Date d'entrée au poste actuel"))
                anciennete = annees_revolues(entree, aujourd_hui) if entree and entree <= aujourd_hui else None
                if anciennete is None:
                    nombres['anciennete_poste_non_calculable'] += 1
                # Source 'Statut' = régime administratif (fonctionnaire, contractuel...),
                # cible 'Statut' = statut d'activité (actif/inactif) : incompatible.
                cible = {
                    'Matricule_Enseignant': identifiant,  # ID source, PAS un matricule officiel garanti.
                    'nom': None,  # non disponible dans Carto_Minedub.
                    'prenom': None,
                    'Statut': None,
                    'Paye_Par_Etat': None,
                    # La langue d'expression sert de sous-système (décision utilisateur), sauf option contraire.
                    'Sous_Systeme_Formation': (sous_systeme_langue(src.get("Langue d'expression"))
                                               if langue_comme_sous_systeme else None),
                    'Ecole_Attache_Actuelle': code_ecole,
                    'Age': age,
                    'Anciennete_Carriere': None,
                    'Anciennete_Poste_Actuel': anciennete,
                    'Annees_Zone_Difficulte_1': None,
                    'Annees_Zone_Difficulte_2': None,
                    'Situation_Matrimoniale': situation_familiale(src.get('Situation familliale')),
                    'Nombre_Enfants_A_Charge': None,
                    'Formations_Continues': None,
                    'Voeu_1': None, 'Voeu_2': None, 'Voeu_3': None,
                    'Motif_Bonification': None,
                }
                sortie.ajouter([cible[k] for k in COLS_ENSEIGNANTS])
                nombres['personnels_exportes'] += 1
    finally:
        sortie.fermer()
        fichier.fermer()
    return nombres, rattaches


def generer(args):
    dossier = Path(args.sortie).resolve()
    dossier.mkdir(parents=True, exist_ok=True)
    date_ref = date.fromisoformat(args.date_reference) if args.date_reference else date.today()
    source_ecoles = Path(args.ecoles).resolve()
    source_personnels = Path(args.personnels).resolve()
    for chemin in (source_ecoles, source_personnels):
        if not chemin.is_file():
            raise FileNotFoundError(f'Fichier introuvable : {chemin}')

    ecoles, index, anomalies = charger_ecoles(source_ecoles)
    cible_ens = dossier / 'enseignants_national_formates.xlsx'
    journal_non_rattaches = dossier / 'enseignants_non_rattaches.csv'
    bilan, rattaches = traiter_enseignants(source_personnels, ecoles, index,
                                          cible_ens, journal_non_rattaches, date_ref,
                                          args.langue_comme_sous_systeme)

    cible_ecoles = dossier / 'etablissements_national_formates.xlsx'
    xlsx = EcrivainXlsx(cible_ecoles, COLS_ECOLES)
    try:
        for idx, ecole in enumerate(ecoles):
            if args.remplir_salles_simple_flux:
                ecole['Salles_Simple_Flux'] = ecole['_S4_SALLES_TOTAL']
            if args.remplir_enseignants_actuels:
                # Nombre de personnes rapprochées de l'école, non recensement validé
                # du seul corps enseignant. Les non-rattachés sont omis.
                ecole['Enseignants_Actuels'] = rattaches.get(idx, 0)
            xlsx.ajouter([ecole[k] for k in COLS_ECOLES])
    finally:
        xlsx.fermer()

    rapport = dossier / 'rapport_harmonisation.txt'
    non_rattaches = sum(bilan[k] for k in
                        ('aucune_correspondance', 'correspondance_ambigue', 'informations_insuffisantes'))
    lignes = [
        'RAPPORT HARMONISATION MINEDUB -> ALGOPLANR',
        '=' * 49,
        f'Date de reference : {date_ref.isoformat()}',
        f'Etablissements exportes : {len(ecoles):,}',
        f'Fiches de personnel exportees : {bilan["personnels_exportes"]:,}',
        f'Personnels rapproches a une ecole : {sum(rattaches.values()):,}',
        f'Personnels non rattaches : {non_rattaches:,}',
        f'  - Meme region, departement, arrondissement et ecole : {bilan["correspondance_niveau_0"]:,}',
        f'  - Meme region, departement et ecole : {bilan["correspondance_niveau_1"]:,}',
        f'  - Meme region et ecole : {bilan["correspondance_niveau_2"]:,}',
        f'  - Graphie voisine (departement) : {bilan["correspondance_niveau_3"]:,}',
        f'  - Graphie voisine (region) : {bilan["correspondance_niveau_4"]:,}',
        f'  - Noms ambigus : {bilan["correspondance_ambigue"]:,}',
        f'  - Noms sans correspondance : {bilan["aucune_correspondance"]:,}',
        f'  - Informations insuffisantes : {bilan["informations_insuffisantes"]:,}',
        f'Age non calculable : {bilan["age_non_calculable"]:,}',
        f'Anciennete poste non calculable : {bilan["anciennete_poste_non_calculable"]:,}',
        f'Ecoles avec effectifs invalides : {anomalies["ecoles_effectifs_invalides"]:,}',
        f'Codes etablissements en double : {anomalies["codes_ecoles_en_double"]:,}',
        f'Ecoles non fonctionnelles dont l effectif est laisse vide : {anomalies["ecoles_non_fonctionnelles_effectif_vide"]:,}',
        '',
        'REGLES ET LIMITES IMPORTANTES',
        '- On conserve CODE_ETABLISSEMENT comme Identifiant_Ecole (texte).',
        '- On conserve ID du personnel comme Matricule_Enseignant technique ;',
        '  le fichier source ne prouve pas que cet ID soit un matricule officiel.',
        '- Les fichiers modeles contiennent des donnees de demonstration qui ne sont pas reprises.',
        '- Les ecoles non fonctionnelles restent dans le perimetre exporte.',
        '- Effectif_Eleves_Attendus = somme des effectifs constates (2024-2025) :',
        '  il ne s agit pas d une prevision du futur.',
        '- Effectif vide (et non 0) pour les ecoles non fonctionnelles dont tous les effectifs valent 0 :',
        '  l absence d eleves n est pas demontree (ecole fermee, insecurite, etc.).',
        '- Accessibilite_Zone = milieu rural/urbain connu, sans extrapoler enclave.',
        '- Le champ Commune reste vide car Arrondissement ne prouve pas la Commune.',
        '- Circonscription_IAEB = ARRONDISSEMENT : chaque arrondissement est une IAEB.',
        '- Nom/prenom des personnels indisponibles : champs laisses vides.',
        '- Statut administratif source (fonctionnaire/contractuel) != statut',
        '  activite cible (actif/inactif) : colonne Statut laissee vide.',
        '- Sous_Systeme_Formation = langue d expression (Francais -> Francophone, Anglais -> Anglophone)'
        f' : {"OUI" if args.langue_comme_sous_systeme else "NON (champ vide ; l application le deduit de l ecole)"}.',
        '- Les personnels hors ecoles primaires (ministere, administrations,',
        '  maternelles...) restent dans le fichier de personnel, mais ne sont',
        '  pas rattaches arbitrairement a une ecole.',
        '- Ages/anciennetes sont calcules a la date de reference.',
        '- Securite, geolocalisation, voeux et autres champs sans source restent vides.',
        f'- Option simple flux activee : {"OUI (hypothese non verifiee)" if args.remplir_salles_simple_flux else "NON"}.',
        f'- Option enseignants actuels activee : {"OUI (comptage partiel des personnels rapproches)" if args.remplir_enseignants_actuels else "NON"}.',
        '',
        'FICHIERS GENERES',
        *[str(x) for x in (cible_ecoles, cible_ens, cible_ecoles.with_suffix('.csv'), cible_ens.with_suffix('.csv'), journal_non_rattaches)],
    ]
    rapport.write_text('\n'.join(lignes) + '\n', encoding='utf-8')
    print('\n'.join(lignes[:18]))
    print(f'\nRapport complet : {rapport}')


def main():
    ici = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--ecoles', default=str(ici / 'BD Ecoles primaires publiques 2024_2025 Actual.xlsx'))
    parser.add_argument('--personnels', default=str(ici / 'CARTO_MINEDUB.xlsx'))
    parser.add_argument('--sortie', default=str(ici / 'resultats_minedub'))
    parser.add_argument('--date-reference', help='Date du calcul d age/anciennete : AAAA-MM-JJ (defaut : aujourd hui)')
    parser.add_argument('--remplir-salles-simple-flux', action='store_true',
                        help='Assimiler le nombre total de salles au simple flux (non verifie)')
    parser.add_argument('--remplir-enseignants-actuels', action='store_true',
                        help='Compter les personnes rapprochees comme enseignants (comptage partiel, non valide)')
    parser.add_argument('--langue-comme-sous-systeme', action=argparse.BooleanOptionalAction, default=True,
                        help='Sous_Systeme_Formation = langue d expression (Francophone/Anglophone) ; '
                             'actif par defaut, --no-langue-comme-sous-systeme pour le laisser vide')
    args = parser.parse_args()
    generer(args)


if __name__ == '__main__':
    main()
