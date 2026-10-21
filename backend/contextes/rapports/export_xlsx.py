"""Classeur Excel des rapports territoriaux (lot 4, sous-lot 4.7), avec la même charte que les exports du
frontend (`frontend/components/shared/exports/export-xlsx.ts`) : en-tête bleu foncé, première ligne figée,
filtre automatique, formats de nombre, bordures fines, largeurs de colonnes d'après le contenu.
"""
from __future__ import annotations

import io
from typing import Any, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from contextes.donnees.lecteur import _cellule_sure

COULEUR_ENTETE = "FF1F4E79"
COULEUR_BORDURE = "FFBFBFBF"
LARGEUR_MIN, LARGEUR_MAX = 8, 60
LONGUEUR_MAX_NOM_FEUILLE = 31

_BORDURE = Border(*(Side(style="thin", color=COULEUR_BORDURE) for _ in range(4)))
_POLICE_ENTETE = Font(bold=True, color="FFFFFFFF")
_FOND_ENTETE = PatternFill("solid", fgColor=COULEUR_ENTETE)


def nom_de_feuille(nom: str, deja: set) -> str:
    """Nom de feuille valide (31 caractères, sans [ ] : * ? / \\) et unique dans le classeur."""
    propre = "".join(c if c not in "[]:*?/\\" else " " for c in nom).strip() or "Feuille"
    candidat = propre[:LONGUEUR_MAX_NOM_FEUILLE]
    n = 2
    while candidat.lower() in deja:
        suffixe = f" ({n})"
        candidat = propre[:LONGUEUR_MAX_NOM_FEUILLE - len(suffixe)] + suffixe
        n += 1
    deja.add(candidat.lower())
    return candidat


def _largeur(entete: str, valeurs: List[Any]) -> int:
    plus_long = max([len(str(entete))] + [len(f"{v:,.1f}".replace(",", " ") if isinstance(v, float) else str(v))
                                          for v in valeurs[:500] if v is not None])
    return min(LARGEUR_MAX, max(LARGEUR_MIN, plus_long + 3))


def ecrire_feuille(wb: Workbook, nom: str, entetes: List[str], lignes: List[List[Any]], deja: set) -> Worksheet:
    """Une feuille stylée : en-tête figé et coloré, filtre automatique, bordures, largeurs ajustées. Les cellules
    texte passent par `_cellule_sure` (neutralise les formules injectées, comme les imports de classeurs)."""
    ws = wb.create_sheet(nom_de_feuille(nom, deja))
    ws.append(entetes)
    for ligne in lignes:
        ws.append([_cellule_sure(v) for v in ligne])
    ws.freeze_panes = "A2"
    for c, entete in enumerate(entetes, start=1):
        cell = ws.cell(row=1, column=c)
        cell.font = _POLICE_ENTETE
        cell.fill = _FOND_ENTETE
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        colonne_vals = [l[c - 1] if c - 1 < len(l) else None for l in lignes]
        ws.column_dimensions[get_column_letter(c)].width = _largeur(entete, colonne_vals)
        if all(isinstance(v, (int, float)) for v in colonne_vals if v is not None) and colonne_vals:
            for r in range(2, len(lignes) + 2):
                ws.cell(row=r, column=c).alignment = Alignment(horizontal="right")
    if entetes:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(entetes))}1"
    for row in ws.iter_rows(min_row=1, max_row=len(lignes) + 1, max_col=max(len(entetes), 1)):
        for cell in row:
            cell.border = _BORDURE
    ws.row_dimensions[1].height = 22
    return ws


def feuille_methodologie(wb: Workbook, registre: List[dict], deja: set) -> None:
    entetes = ["Code", "Intitulé", "Formule", "Population", "Source", "Limites"]
    lignes = [[d["code"], d["intitule"], d["formule"], d["population"], d["source"], d["limites"]]
              for d in registre]
    ws = ecrire_feuille(wb, "Méthodologie", entetes, lignes, deja)
    for c in range(2, 7):
        ws.column_dimensions[get_column_letter(c)].width = 42


def _feuilles_rapport(wb: Workbook, nom_prefixe: str, tableaux: List[dict], deja: set) -> None:
    for t in tableaux:
        entetes = ["Territoire", *t["colonnes"]]
        lignes = [[l["territoire"], *l["valeurs"]] for l in t["lignes"]]
        ecrire_feuille(wb, f"{nom_prefixe}{t['intitule']}"[:LONGUEUR_MAX_NOM_FEUILLE], entetes, lignes, deja)


def classeur_perimetre(rapport: dict, tableaux: List[dict]) -> bytes:
    """Classeur d'un seul périmètre : une feuille par indicateur, plus la méthodologie."""
    wb = Workbook()
    wb.remove(wb.active)
    deja: set = set()
    _feuilles_rapport(wb, "", tableaux, deja)
    feuille_methodologie(wb, rapport["registre_indicateurs"], deja)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def classeur_national_complet(complet: dict) -> bytes:
    """Une feuille de synthèse nationale, une feuille par région, et la méthodologie. Le détail par
    arrondissement et par école reste dans les exports par département (document plus maniable que les quelque
    360 arrondissements et plus de 13 000 écoles du pays en une seule feuille)."""
    wb = Workbook()
    wb.remove(wb.active)
    deja: set = set()
    _feuilles_rapport(wb, "National — ", complet["national"]["tableaux"], deja)
    for section in complet["regions"]:
        _feuilles_rapport(wb, f"{section['titre'][:10]} — ", section["tableaux"], deja)
    feuille_methodologie(wb, complet["registre_indicateurs"], deja)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
