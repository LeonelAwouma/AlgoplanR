"""Cas d'usage du contexte Données : import, jeux, qualité.

Un délégué régional importe les classeurs de sa région ou ceux de la base nationale. Un fichier qui porte des
écoles d'autres régions est reconnu automatiquement comme national (`base_nationale`) : seules les écoles de sa
région et les enseignants qui y sont attachés sont retenus, puis soumis aux contrôles régionaux. Un fichier d'une
seule région est contrôlé ligne par ligne : région vide ou illisible, il est refusé en entier.

Le DRH importe la base nationale telle quelle (jeu national). Les postes étant autonomes, il n'existe plus de
consolidation des jeux régionaux ; les jeux consolidés enregistrés auparavant restent consultables.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from django.db import transaction
from django.http import Http404

from contextes.acces.controle_import import colonnes_region, refuser_si_hors_region
from contextes.acces.perimetre import PORTEE_NATIONALE, PORTEE_REGIONALE
from contextes.commun.erreurs import RefusMetier
from domaine.acces.controle_regions import contient_autres_regions, motifs_lisibles, numero_ligne
from domaine.acces.isolement_regional import isoler_region
from domaine.acces.regions import region_canonique
from domaine.commun.texte import texte
from domaine.donnees import colonnes as C
from domaine.donnees.annee_scolaire import (ORIGINE_CONFIRMATION, SENS_ANNEE, SENS_DONNEES, annee_des_donnees,
                                            normaliser_annee_scolaire)
from domaine.donnees import correspondance as corr
from domaine.donnees.demonstration import construire_jeu_demonstration
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.donnees.sous_systemes import completer_sous_systemes
from domaine.parametrage import config as cfg_dom
from domaine.qualite.rapport import controler

from . import depots
from .lecteur import FichierIllisible, lire_classeur_numerote
from .models import FichierImporte, JeuDeDonnees, RapportQualite

TYPES = ("etablissements", "enseignants", "prince")
MAX_LIGNES_RAPPORT = 200
#: Liste d'une actualisation au-delà de laquelle le détail nominatif est tronqué (le décompte reste exact).
MAX_ECARTS_DETAILLES = 1000
MESSAGE_PRINCE_SANS_NOMINATIF = ("Les faits du Prince portent sur des matricules : ils ne peuvent pas être appliqués "
                                 "sans fichier nominatif des enseignants.")


def recevoir_fichier(type_fichier: str, upload, feuille: Optional[str] = None, *, compte=None,
                     base_nationale: bool = False) -> FichierImporte:
    """Lit un classeur envoyé et le rattache au compte qui l'envoie.

    Fichier régional d'un délégué : toute colonne « Région » est vérifiée dès l'envoi, et à la moindre ligne
    sans région exploitable rien n'est enregistré. Fichier de la base nationale (déclaré, ou reconnu à ses
    régions multiples) : les autres régions sont écartées à la création du jeu.
    """
    if type_fichier not in TYPES:
        raise RefusMetier("Type de fichier invalide", [f"type doit valoir {' ou '.join(TYPES)}"])
    try:
        feuilles, lue, entetes, lignes, numeros = lire_classeur_numerote(upload.read(), upload.name, feuille)
    except FichierIllisible as exc:
        raise RefusMetier(str(exc), code="fichier_illisible")
    if not lignes:
        raise RefusMetier("Le fichier ne contient aucune ligne de données", code="fichier_vide")
    if compte is not None and compte.est_delegue:
        colonnes = colonnes_region(entetes)
        # Un fichier qui porte des écoles d'autres régions est la base nationale : on en extrait la région du
        # délégué à la création du jeu, sans qu'il ait à le déclarer.
        if any(contient_autres_regions(lignes, c, compte.region) for c in colonnes):
            base_nationale = True
        if not base_nationale:
            refuser_si_hors_region(compte.region, lignes, numeros, colonnes, upload.name)
    det = corr.detecter(type_fichier, entetes)
    return FichierImporte.objects.create(
        type=type_fichier, nom_fichier=upload.name, feuille=lue, feuilles=feuilles, entetes=entetes,
        apercu=lignes[:10], correspondance=det["correspondance"], a_confirmer=det["a_confirmer"], lignes=lignes,
        numeros_lignes=numeros, base_nationale=base_nationale, cree_par=compte)


def fichier_du_compte(compte, ident) -> FichierImporte:
    """Fichier envoyé par ce compte ; celui d'un autre compte répond comme s'il n'existait pas."""
    f = FichierImporte.objects.filter(pk=ident, cree_par=compte).first()
    if f is None:
        raise Http404("Fichier introuvable")
    return f


def _controler_colonne_region(f: FichierImporte, compte) -> None:
    """Délégué, fichier régional : refait le contrôle régional sur la colonne associée à « Region » (après une
    correction)."""
    source = f.correspondance.get(C.COL_ETAB_REGION)
    if compte is not None and compte.est_delegue and not f.base_nationale and source:
        refuser_si_hors_region(compte.region, f.lignes, f.numeros_lignes, [source], f.nom_fichier)


def corriger_correspondance(fichier: FichierImporte, correspondance: Dict[str, str], *, compte=None
                            ) -> FichierImporte:
    attendues = corr.COLONNES_PAR_TYPE[fichier.type]
    erreurs = []
    for officiel, source in correspondance.items():
        if officiel not in attendues:
            erreurs.append(f"Colonne attendue inconnue : {officiel}")
        elif source not in fichier.entetes and source not in ("", None):
            erreurs.append(f"En-tête absent du fichier : {source}")
    if erreurs:
        raise RefusMetier("Correspondance invalide", erreurs)
    nouvelle = dict(fichier.correspondance)
    for officiel, source in correspondance.items():
        if source in ("", None):
            nouvelle.pop(officiel, None)
        else:
            nouvelle[officiel] = source
    fichier.correspondance = nouvelle
    _controler_colonne_region(fichier, compte)
    fichier.a_confirmer = [
        {"colonne": c, "obligatoire": c in corr.OBLIGATOIRES[fichier.type], "suggestions": []}
        for c in corr.COLONNES_PAR_TYPE[fichier.type]
        if c not in nouvelle and c not in corr.OPTIONNELLES]
    fichier.save(update_fields=["correspondance", "a_confirmer"])
    return fichier


def _lignes_normalisees(f: FichierImporte) -> List[Dict[str, Any]]:
    manquantes = [c for c in corr.OBLIGATOIRES[f.type] if c not in f.correspondance]
    if manquantes:
        raise RefusMetier("Colonnes obligatoires non associées",
                          [f"{c} : à confirmer via PATCH /fichiers/{f.id}/correspondances/" for c in manquantes],
                          code="correspondance_incomplete")
    return corr.appliquer(f.lignes, f.correspondance)


def _refus_lignes(message: str, anomalies: List[dict], code: str, region: str, fichier: str) -> RefusMetier:
    anomalies = sorted(anomalies, key=lambda a: a["ligne"])
    return RefusMetier(message, motifs_lisibles(anomalies), code=code,
                       details={"region_autorisee": region, "fichier": fichier, "total": len(anomalies),
                                "lignes": anomalies[:MAX_LIGNES_RAPPORT]})


@dataclass
class _Selection:
    """Lignes d'un fichier qui entrent dans le jeu : brutes (en-têtes sources), normalisées, numéros dans le
    classeur. Toutes les lignes, ou seulement celles de la région extraites de la base nationale."""
    fichier: Optional[FichierImporte]
    brutes: List[dict]
    normalisees: List[dict]
    numeros: List[int]

    @classmethod
    def complete(cls, f: FichierImporte) -> "_Selection":
        return cls(f, f.lignes, _lignes_normalisees(f), f.numeros_lignes)

    @classmethod
    def absente(cls) -> "_Selection":
        """Fichier des enseignants non fourni (établissements seuls) : aucune ligne, aucun enseignant inventé."""
        return cls(None, [], [], [])

    def garder(self, indices: Sequence[int]) -> "_Selection":
        return _Selection(self.fichier, [self.brutes[i] for i in indices], [self.normalisees[i] for i in indices],
                          [numero_ligne(self.numeros, i) for i in indices])


def _exiger_colonne_region(f_etab: FichierImporte) -> None:
    if C.COL_ETAB_REGION not in f_etab.correspondance:
        raise RefusMetier("Colonne Région obligatoire pour un import régional",
                          [f"Associez la colonne « Region » du fichier {f_etab.nom_fichier} avant de créer le jeu"],
                          code="region_obligatoire")


def _extraire_region(region: str, e: _Selection, n: _Selection) -> Tuple[_Selection, _Selection, dict]:
    """Base nationale : écoles de la région du délégué et enseignants rattachés à l'une d'elles par le code d'école.

    Renvoie aussi le bilan de l'isolement (retenus, exclus, non rattachés, ambigus). Seules les lignes retenues
    sont conservées : rien d'une autre région n'atteint la base de données.
    """
    _exiger_colonne_region(e.fichier)
    cols_ens = colonnes_region(n.fichier.entetes) if n.fichier is not None else []
    gardees_e, gardees_n, bilan = isoler_region(
        region, e.normalisees, n.normalisees, e.numeros, n.numeros,
        [[texte(l.get(c)) for c in cols_ens] for l in n.brutes], col_region=C.COL_ETAB_REGION,
        col_id=C.COL_ETAB_ID, col_ecole=C.COL_ENS_ETAB)
    if not gardees_e:
        raise RefusMetier(f"Aucune école de la région {region} dans « {e.fichier.nom_fichier} »",
                          ["Vérifiez que la colonne associée à « Region » porte bien le nom des régions"],
                          code="region_absente", details={"region_autorisee": region, "bilan": bilan})
    return e.garder(gardees_e), n.garder(gardees_n), bilan


def _controle_regional(region: str, e: _Selection, n: _Selection) -> None:
    """Contrôles d'un import régional (fichiers d'une seule région), sur les lignes retenues. Refus du jeu entier
    au premier écart."""
    _exiger_colonne_region(e.fichier)
    refuser_si_hors_region(region, e.normalisees, e.numeros, [C.COL_ETAB_REGION], e.fichier.nom_fichier)
    if n.fichier is None:        # établissements seuls : rien à contrôler côté enseignants
        return
    # Fichier des enseignants : ses éventuelles colonnes Région ont été contrôlées à l'envoi (fichier régional) ;
    # chaque enseignant doit en outre être attaché à une école du fichier régional.
    refuser_si_hors_region(region, n.brutes, n.numeros, colonnes_region(n.fichier.entetes), n.fichier.nom_fichier)
    ecoles = {texte(l.get(C.COL_ETAB_ID)) for l in e.normalisees}
    hors = [{"ligne": numero_ligne(n.numeros, i), "colonne": C.COL_ENS_ETAB, "valeur": ecole,
             "motif": "école d'attache absente du fichier régional"}
            for i, l in enumerate(n.normalisees) if (ecole := texte(l.get(C.COL_ENS_ETAB))) and ecole not in ecoles]
    if hors:
        raise _refus_lignes(
            f"Import refusé : {len(hors)} enseignant(s) attaché(s) à une école hors de la région {region}. "
            "Aucune ligne n'a été enregistrée.", hors, "region_non_autorisee", region, n.fichier.nom_fichier)


def _lignes_du_jeu(compte, f_etab: FichierImporte, f_ens: Optional[FichierImporte]
                   ) -> Tuple[List[dict], List[dict], Optional[dict]]:
    """Lignes normalisées du futur jeu : celles de la région pour un délégué, toutes pour le DRH.

    Le troisième élément est le bilan de l'isolement régional (None hors extraction d'une base nationale)."""
    e = _Selection.complete(f_etab)
    n = _Selection.complete(f_ens) if f_ens is not None else _Selection.absente()
    bilan = None
    if compte.est_delegue:
        if f_etab.base_nationale or (f_ens is not None and f_ens.base_nationale):
            e, n, bilan = _extraire_region(compte.region, e, n)
        else:
            _controle_regional(compte.region, e, n)
        # Graphie officielle de la région, pour que le périmètre imposé au délégué retrouve toutes ses écoles.
        for l in e.normalisees:
            l[C.COL_ETAB_REGION] = compte.region
    else:
        # Base nationale du DRH : graphie officielle des régions reconnues, pour les filtres territoriaux.
        for l in e.normalisees:
            if officielle := region_canonique(l.get(C.COL_ETAB_REGION)):
                l[C.COL_ETAB_REGION] = officielle
    # Sous-système des enseignants absent du fichier : celui de leur école (sinon ils seraient sans contrainte).
    completer_sous_systemes(e.normalisees, n.normalisees)
    return e.normalisees, n.normalisees, bilan


def preparer_fichier_prince(compte, id_fichier) -> Tuple[FichierImporte, List[dict]]:
    """Fichier des faits du Prince joint à la création d'un jeu : vérifié avant que le jeu soit créé.

    Réservé au DRH, comme la page « Fait de Prince ». Les lignes sont celles de la correspondance des colonnes.
    """
    if not compte.est_drh:
        raise RefusMetier("Fichier du Prince réservé au DRH", ["Seul le DRH peut joindre des faits du Prince"],
                          code="prince_reserve_drh")
    f = fichier_du_compte(compte, id_fichier)
    if f.type != "prince":
        raise RefusMetier("Type de fichier incorrect", ["fichier_prince doit être de type prince"])
    return f, _lignes_normalisees(f)


def _annee_scolaire(valeur: Optional[str]) -> str:
    try:
        return normaliser_annee_scolaire(valeur)
    except ValueError as exc:
        raise RefusMetier("Année scolaire invalide", [str(exc)], code="annee_scolaire_invalide")


def _sens_annee(valeur: Optional[str]) -> str:
    """Sens de l'année saisie : « donnees » (année des données, par défaut), « rentree_preparee » ou « non_confirme »."""
    texte = str(valeur or "").strip() or SENS_DONNEES
    if texte not in SENS_ANNEE:
        raise RefusMetier("Sens de l'année scolaire invalide", [f"Valeurs admises : {', '.join(SENS_ANNEE)}"],
                          code="sens_annee_invalide")
    return texte


def _joindre_bilan_regional(rapport: dict, bilan: dict) -> None:
    """Le bilan de l'isolement entre dans le rapport de qualité ; les rattachements douteux deviennent des
    avertissements (les enseignants concernés ne sont rattachés à aucune région)."""
    rapport["import_regional"] = bilan
    for code, cle, libelle in (("ENS_NON_RATTACHES", "enseignants_non_rattaches", "enseignant(s) non rattaché(s)"),
                               ("ENS_AMBIGUS", "enseignants_ambigus", "enseignant(s) au rattachement ambigu"),
                               ("ETAB_ECARTES", "etablissements_ecartes",
                                "établissement(s) écarté(s) (code ou région inexploitable)")):
        if bilan[cle]:
            rapport["avertissements"].append({
                "code": code, "gravite": "avertissement", "valeurs": bilan[cle],
                "message": f"{bilan[cle]} {libelle} : écarté(s) du jeu régional, sans être attribué(s) à une région"})
    rapport["statistiques"]["nb_avertissements"] = len(rapport["avertissements"])


def _fichier_enseignants(compte, ident) -> Optional[FichierImporte]:
    """Fichier des enseignants s'il est désigné, sinon None : mode « établissements seuls ». Aucun identifiant
    n'est inventé pour un fichier absent."""
    if ident in (None, ""):
        return None
    f = fichier_du_compte(compte, ident)
    if f.type != "enseignants":
        raise RefusMetier("Types de fichiers inversés ou incorrects",
                          ["fichier_enseignants doit être de type enseignants"])
    return f


@transaction.atomic
def creer_jeu(nom: str, id_fichier_etab, id_fichier_ens=None, *, compte,
              fichier_prince: Optional[FichierImporte] = None, annee_scolaire: Optional[str] = None,
              sens_annee_scolaire: Optional[str] = None, donnees_fictives: bool = False) -> JeuDeDonnees:
    """Crée un jeu à partir du fichier des établissements (obligatoire) et, si disponible, du fichier nominatif des
    enseignants : régional pour un délégué (sa région seule, même depuis la base nationale), national pour le DRH.

    Sans fichier d'enseignants, le jeu est « établissements seuls » : l'absence est enregistrée explicitement
    (`nominatif_disponible`), aucun enseignant n'est créé et les retraites restent non calculables. `donnees_fictives` :
    jeu de test déclaré fictif par la personne qui l'importe (seule origine vérifiable pour un import)."""
    if not id_fichier_etab:
        raise RefusMetier("Fichier des établissements manquant", ["fichier_etablissements est requis"],
                          code="etablissements_requis")
    f_etab = fichier_du_compte(compte, id_fichier_etab)
    if f_etab.type != "etablissements":
        raise RefusMetier("Types de fichiers inversés ou incorrects",
                          ["fichier_etablissements doit être de type etablissements"])
    f_ens = _fichier_enseignants(compte, id_fichier_ens)
    nominatif = f_ens is not None
    if fichier_prince is not None and not nominatif:
        raise RefusMetier("Faits du Prince : fichier nominatif requis", [MESSAGE_PRINCE_SANS_NOMINATIF],
                          code="prince_sans_nominatif")
    annee, sens = _annee_scolaire(annee_scolaire), _sens_annee(sens_annee_scolaire)
    l_etab, l_ens, bilan = _lignes_du_jeu(compte, f_etab, f_ens)
    rapport = controler(l_etab, l_ens, cfg_dom.defaut(), nominatif=nominatif)
    if bilan is not None:
        _joindre_bilan_regional(rapport, bilan)
    if not rapport["valide"]:
        raise RefusMetier("Les données contiennent des erreurs bloquantes",
                          [e["message"] for e in rapport["erreurs"]], code="qualite_bloquante")
    if compte.est_delegue:
        portee, region = PORTEE_REGIONALE, compte.region
        defaut = f"Import {f_etab.nom_fichier}" + (f" ({region})" if f_etab.base_nationale else "")
    else:
        portee, region, defaut = PORTEE_NATIONALE, None, f"Base nationale ({f_etab.nom_fichier})"
    jeu = JeuDeDonnees.objects.create(nom=nom or defaut, source="import", portee=portee, region=region,
                                      cree_par=compte, annee_scolaire=annee, sens_annee_scolaire=sens,
                                      donnees_fictives=bool(donnees_fictives), nominatif_disponible=nominatif)
    depots.enregistrer(jeu, [construire_ecole(l) for l in l_etab], [construire_enseignant(l) for l in l_ens])
    RapportQualite.objects.create(jeu=jeu, contenu=rapport)
    for f in (f_etab, f_ens, fichier_prince):
        if f is not None:
            f.jeu = jeu
            f.save(update_fields=["jeu"])
    return jeu


@transaction.atomic
def creer_demonstration(nom: str = "", graine: int = 2026, nb_ecoles: int = 60, nb_enseignants: int = 420, *,
                        compte, annee_scolaire: Optional[str] = None,
                        sens_annee_scolaire: Optional[str] = None) -> JeuDeDonnees:
    """Jeu fictif. Pour un délégué, toutes les écoles fictives sont placées dans sa région (jeu régional)."""
    annee, sens = _annee_scolaire(annee_scolaire), _sens_annee(sens_annee_scolaire)
    l_etab, l_ens = construire_jeu_demonstration(graine, nb_ecoles, nb_enseignants)
    if compte.est_delegue:
        for l in l_etab:
            l[C.COL_ETAB_REGION] = compte.region
        jeu = JeuDeDonnees.objects.create(nom=nom or f"Jeu de démonstration ({compte.region})",
                                          source="demonstration", portee=PORTEE_REGIONALE, region=compte.region,
                                          cree_par=compte, annee_scolaire=annee, sens_annee_scolaire=sens,
                                          donnees_fictives=True)
    else:
        jeu = JeuDeDonnees.objects.create(nom=nom or "Jeu de démonstration", source="demonstration",
                                          portee=PORTEE_NATIONALE, cree_par=compte, annee_scolaire=annee,
                                          sens_annee_scolaire=sens, donnees_fictives=True)
    depots.enregistrer(jeu, [construire_ecole(l) for l in l_etab], [construire_enseignant(l) for l in l_ens])
    RapportQualite.objects.create(jeu=jeu, contenu=controler(l_etab, l_ens, cfg_dom.defaut()))
    return jeu


MESSAGE_ETABLISSEMENTS_SEULS = ("Jeu d'établissements seuls : aucun fichier nominatif des enseignants. Les analyses "
                                "scolaires sont disponibles ; les retraites, les affectations individuelles et certains "
                                "scénarios restent incomplets jusqu'à l'importation des enseignants.")


def mode_nominatif(jeu: JeuDeDonnees) -> dict:
    """Mode d'import du jeu, tel qu'enregistré : « complet » (établissements et enseignants) ou
    « etablissements_seuls »."""
    if jeu.nominatif_disponible:
        return {"nominatif_disponible": True, "mode_import": "complet", "message_mode_import": None}
    return {"nominatif_disponible": False, "mode_import": "etablissements_seuls",
            "message_mode_import": MESSAGE_ETABLISSEMENTS_SEULS}


def exiger_nominatif(jeu: JeuDeDonnees, fonction: str) -> None:
    """Refuse explicitement une fonction qui exige des agents identifiés quand le jeu n'a pas de fichier nominatif.
    Aucun enseignant, matricule ou retraite fictif n'est créé pour la laisser s'exécuter."""
    if not jeu.nominatif_disponible:
        raise RefusMetier(
            f"{fonction} : fichier nominatif des enseignants indisponible",
            [f"{fonction} exige des agents identifiés (matricule, âge, école d'attache). Ce jeu a été créé avec les "
             "établissements seuls : importez le fichier des enseignants (actualisation du jeu) pour l'activer."],
            code="nominatif_indisponible")


def resume_jeu(jeu: JeuDeDonnees) -> dict:
    return {
        "id": str(jeu.id), "nom": jeu.nom, "source": jeu.source, "cree_le": jeu.cree_le,
        "annee_scolaire": jeu.annee_scolaire, "sens_annee_scolaire": jeu.sens_annee_scolaire,
        "sens_annee_origine": jeu.sens_annee_origine,
        "annee_donnees": annee_des_donnees(jeu.annee_scolaire, jeu.sens_annee_scolaire),
        # Origine fictive vérifiable : jeu de démonstration, ou marqueur déclaré ; jamais déduite du nom ni de la taille.
        "donnees_fictives": jeu.source == "demonstration" or jeu.donnees_fictives,
        "portee": jeu.portee, "region": jeu.region, "consolide_depuis": jeu.consolide_depuis,
        "cree_par": jeu.cree_par.identifiant if jeu.cree_par_id else None,
        "nb_etablissements": jeu.etablissements.count(),
        # Inconnu (None) quand aucun fichier nominatif n'a été fourni : jamais 0 enseignant par défaut.
        "nb_enseignants": jeu.enseignants.count() if jeu.nominatif_disponible else None,
        **mode_nominatif(jeu),
        "nb_scenarios": jeu.scenarios.count(),
        "nb_faits_prince": jeu.faits_prince.filter(statut="ACTIF").count(),
        "nb_arbitrages": jeu.arbitrages.count(), "nb_recrues": jeu.recrues.count(),
        "donnees_manquantes": {
            "ecoles_sans_effectif": jeu.etablissements.filter(effectif_connu=False).count(),
            "ecoles_sans_salles": jeu.etablissements.filter(salles_connues=False).count(),
            "enseignants_sans_age": (jeu.enseignants.filter(age_connu=False).count() if jeu.nominatif_disponible
                                     else None)},
        "statut": jeu.statut, "valide_le": jeu.valide_le, "valide_par": jeu.valide_par or None,
        "scenario_retenu_id": str(jeu.scenario_retenu_id) if jeu.scenario_retenu_id else None,
        "fichiers_source": {f.type: f.nom_fichier for f in jeu.fichiers.order_by("cree_le")},
    }


@transaction.atomic
def modifier_jeu(jeu: JeuDeDonnees, corps: dict, *, request) -> dict:
    """Confirme ou corrige le sens de l'année saisie, ou déclare l'origine fictive d'un jeu. Explicite et réversible :
    l'année saisie n'est jamais réécrite, chaque changement est journalisé (avant / après) et la version conservée de
    la planification devient obsolète quand la base des projections change."""
    from contextes.audit.services import journaliser
    avant = {"sens_annee_scolaire": jeu.sens_annee_scolaire, "sens_annee_origine": jeu.sens_annee_origine,
             "donnees_fictives": jeu.donnees_fictives}
    champs = []
    if "sens_annee_scolaire" in corps:
        jeu.sens_annee_scolaire = _sens_annee(corps["sens_annee_scolaire"])
        jeu.sens_annee_origine = ORIGINE_CONFIRMATION
        champs += ["sens_annee_scolaire", "sens_annee_origine"]
    if "donnees_fictives" in corps:
        valeur = corps["donnees_fictives"]
        if not isinstance(valeur, bool):
            raise RefusMetier("Valeur invalide", ["donnees_fictives doit valoir true ou false"])
        if jeu.source == "demonstration" and not valeur:
            raise RefusMetier("Jeu de démonstration", ["Un jeu de démonstration est toujours fictif"],
                              code="demonstration_fictive")
        jeu.donnees_fictives = valeur
        champs.append("donnees_fictives")
    if not champs:
        raise RefusMetier("Aucune modification", ["sens_annee_scolaire ou donnees_fictives attendu"])
    jeu.save(update_fields=champs)
    apres = {"sens_annee_scolaire": jeu.sens_annee_scolaire, "sens_annee_origine": jeu.sens_annee_origine,
             "donnees_fictives": jeu.donnees_fictives}
    if apres != avant:
        base_avant = annee_des_donnees(jeu.annee_scolaire, avant["sens_annee_scolaire"])
        base_apres = annee_des_donnees(jeu.annee_scolaire, apres["sens_annee_scolaire"])
        journaliser(jeu, "import", "modification du jeu",
                    f"Année saisie {jeu.annee_scolaire} : sens « {apres['sens_annee_scolaire']} » (base {base_apres}, "
                    f"auparavant {base_avant}) ; données fictives : {'oui' if apres['donnees_fictives'] else 'non'}",
                    request=request, objet=("jeu", jeu.id), avant=avant, apres=apres)
        if base_apres != base_avant:
            # Les libellés calendaires et le décalage des âges changent : les projections conservées sont périmées.
            from contextes.diagnostic.services import invalider_cache
            from contextes.planification.services import marquer_obsolete
            invalider_cache(jeu)
            marquer_obsolete(jeu, "Sens de l'année scolaire du jeu modifié")
    return resume_jeu(jeu)


# --- Validation et actualisation ------------------------------------------------------------------------------


def _rapport_qualite(jeu: JeuDeDonnees) -> Optional[dict]:
    try:
        return jeu.rapport_qualite.contenu
    except RapportQualite.DoesNotExist:
        return None


def validation(jeu: JeuDeDonnees) -> dict:
    from contextes.diagnostic.services import preparer
    from domaine.donnees.validation import controles_validation
    application = preparer(jeu).application
    rejetes = [{"id_ens": d.id_ens, "motifs": list(d.rejets)} for d in (application.decisions if application else [])
               if not d.appliquee]
    return {"statut": jeu.statut, "valide_le": jeu.valide_le, "valide_par": jeu.valide_par or None,
            "reserve": jeu.validation_reserve,
            "controles": controles_validation(depots.charger_ecoles(jeu), depots.charger_enseignants(jeu),
                                              _rapport_qualite(jeu),
                                              application.ecarts_effectifs if application else (), rejetes,
                                              nominatif=jeu.nominatif_disponible)}


@transaction.atomic
def valider(jeu: JeuDeDonnees, *, request, auteur: str, reserve: Optional[str] = None) -> dict:
    """Valide le jeu comme référence des projections.

    - Validation normale : aucun contrôle bloquant en échec.
    - Validation **avec réserve DRH** : seuls les contrôles bloquants *dérogeables* (écarts d'effectif des écoles
      touchées par un fait du Prince) peuvent être en échec ; un motif est obligatoire, la réserve est réservée à la
      DRH, tracée au journal et reprise dans les rapports. Les incohérences structurelles ne se dérogent jamais.
    """
    from django.utils import timezone

    from contextes.audit.services import journaliser
    v = validation(jeu)
    bloquants = [c for c in v["controles"] if c["bloquant"] and not c["ok"]]
    structurels = [c for c in bloquants if not c["derogeable"]]
    derogeables = [c for c in bloquants if c["derogeable"]]
    motif = str(reserve or "").strip()
    if structurels:
        raise RefusMetier(f"Validation impossible : {', '.join(c['libelle'] for c in structurels)}.",
                          [c["detail"] for c in structurels], code="validation_bloquee",
                          details={"controles": bloquants, "derogation_possible": False})
    if derogeables and not motif:
        raise RefusMetier(f"Validation impossible : {', '.join(c['libelle'] for c in derogeables)}.",
                          [c["detail"] for c in derogeables] + [
                              "La DRH peut valider avec réserve en motivant sa décision."],
                          code="validation_bloquee", details={"controles": bloquants, "derogation_possible": True})
    if derogeables and not getattr(request.user, "est_drh", False):
        raise RefusMetier("La validation avec réserve est réservée à la DRH",
                          ["Seul le DRH peut déroger aux contrôles d'effectif"], code="derogation_reservee_drh")
    maintenant = timezone.now()
    jeu.validation_reserve = ({"motif": motif, "auteur": auteur, "le": maintenant.isoformat(timespec="seconds"),
                               "controles": [{"code": c["code"], "libelle": c["libelle"], "detail": c["detail"]}
                                             for c in derogeables]} if derogeables else None)
    jeu.statut, jeu.valide_le, jeu.valide_par = "valide", maintenant, auteur
    jeu.save(update_fields=["statut", "valide_le", "valide_par", "validation_reserve"])
    journaliser(jeu, "validation_donnees", "validé avec réserve" if derogeables else "validé",
                "Jeu validé avec réserve DRH : " + motif if derogeables
                else "Jeu validé comme référence des projections", request=request,
                auteur=auteur, objet=("jeu", jeu.id), avant={"statut": "brouillon"},
                apres={"statut": "valide", "reserve": jeu.validation_reserve})
    return validation(jeu)


def _reevaluer_faits_prince(jeu: JeuDeDonnees) -> List[dict]:
    """Réévalue les faits du Prince actifs sur les données actualisées. Un fait devenu impossible (agent déjà dans
    l'école de destination, école d'origine vide…) passe à l'état INVALIDE avec son motif : il n'est jamais appliqué en
    silence et reste visible dans la liste des faits et dans les écarts de l'actualisation."""
    from contextes.diagnostic.services import preparer
    from domaine.prince.projection import appliquer_effets_prince
    faits = list(jeu.faits_prince.filter(statut="ACTIF").order_by("id"))
    if not faits:
        return []
    avant = preparer(jeu).avant()
    app = appliquer_effets_prince(avant.ecoles, list(avant.enseignants.values()),
                                  [{"id_ens": f.id_ens, "id_etab": f.id_etab, "motif": f.motif} for f in faits],
                                  avant.cfg)
    invalidees = []
    for f, d in zip(faits, app.decisions):
        if d.rejets:
            f.statut, f.motif_invalidite = "INVALIDE", " ; ".join(d.rejets)[:500]
            f.save(update_fields=["statut", "motif_invalidite"])
            invalidees.append({"type": "fait_prince", "id": str(f.pk), "motif": f.motif_invalidite})
    return invalidees


def _invalider_decisions(jeu: JeuDeDonnees, ids_ecoles: set, matricules: set) -> List[dict]:
    """Décisions qui ne s'appliquent plus aux nouvelles données : faits du Prince et nominations annulés,
    arbitrages supprimés."""
    from django.utils import timezone

    from domaine.donnees.actualisation import motif_invalidation
    invalidees = []
    for f in jeu.faits_prince.filter(statut="ACTIF"):
        motif = motif_invalidation(f.id_ens, f.id_etab, ids_ecoles, matricules)
        if motif:
            f.statut = "ANNULE"
            f.save(update_fields=["statut"])
            invalidees.append({"type": "fait_prince", "id": str(f.pk), "motif": motif})
    for a in jeu.arbitrages.all():
        motif = motif_invalidation(a.id_ens, a.id_etab, ids_ecoles, matricules)
        if motif:
            invalidees.append({"type": "arbitrage", "id": str(a.pk), "motif": motif})
            a.delete()
    for n in jeu.nominations.filter(statut__in=["proposee", "validee"]):
        motif = motif_invalidation(n.matricule or "", texte(n.poste.get("id_ecole")), ids_ecoles, matricules)
        if motif:
            n.historique = [*n.historique, {"de": n.statut, "vers": "annulee", "le": timezone.now().isoformat(),
                                            "auteur": None, "motif": motif, "reference": None}]
            n.statut, n.motif = "annulee", motif
            n.save(update_fields=["statut", "motif", "historique"])
            invalidees.append({"type": "nomination", "id": str(n.pk), "motif": motif})
    return invalidees


def _lignes_des_enseignants_enregistres(enseignants) -> List[dict]:
    """Lignes (colonnes officielles) des enseignants déjà enregistrés, pour contrôler un jeu dont le fichier
    nominatif n'est pas renvoyé. Une colonne d'âge absente à l'origine (35 ans supposés) le reste."""
    lignes = []
    for t in enseignants:
        l = {k: v for k, v in t.vers_dict().items() if k in C.COLONNES_ATTENDUES_ENS or k in ("nom", "prenom")}
        if not t.age_connu and t.age == 35.0:
            l.pop(C.COL_ENS_AGE, None)
        lignes.append(l)
    return lignes


def _tronquer(liste: List[dict]) -> List[dict]:
    return liste[:MAX_ECARTS_DETAILLES]


@transaction.atomic
def actualiser(jeu: JeuDeDonnees, id_fichier_etab, id_fichier_ens=None, *, compte, request, auteur: str,
               supprimer_nominatif: bool = False):
    """Actualise un jeu importé avec un nouveau fichier d'établissements ; conserve les décisions valables.

    Le sort des données nominatives est explicite :
    - nouveau fichier d'enseignants → il remplace les enseignants enregistrés (ou les crée : passage d'un jeu
      « établissements seuls » à un jeu complet) ;
    - aucun nouveau fichier → les enseignants enregistrés sont conservés, jamais supprimés ;
    - `supprimer_nominatif` → suppression volontaire des données nominatives, seule façon de les retirer, journalisée.
    """
    from contextes.audit.services import journaliser
    from contextes.diagnostic.services import invalider_cache
    from contextes.planification.services import marquer_obsolete
    from contextes.simulation.services import recalculer_scenarios
    from domaine.donnees.actualisation import ecarts as calculer_ecarts

    from .models import Actualisation

    if jeu.portee != PORTEE_REGIONALE and not (jeu.portee == PORTEE_NATIONALE and jeu.source == "import"):
        raise RefusMetier("Seul un jeu importé s'actualise par import",
                          ["Un jeu national se remplace par un nouvel import de la base nationale"],
                          code="actualisation_impossible")
    if not id_fichier_etab:
        raise RefusMetier("Fichier des établissements manquant", ["etablissements est requis"],
                          code="etablissements_requis")
    f_etab = fichier_du_compte(compte, id_fichier_etab)
    if f_etab.type != "etablissements":
        raise RefusMetier("Types de fichiers inversés ou incorrects",
                          ["etablissements doit désigner un fichier d'établissements"])
    f_ens = _fichier_enseignants(compte, id_fichier_ens)
    if f_ens is not None and supprimer_nominatif:
        raise RefusMetier("Demande contradictoire",
                          ["Un nouveau fichier d'enseignants et la suppression des données nominatives s'excluent"],
                          code="nominatif_contradictoire")
    if supprimer_nominatif and not jeu.nominatif_disponible:
        raise RefusMetier("Aucune donnée nominative à supprimer", ["Ce jeu ne contient pas de fichier nominatif"],
                          code="nominatif_deja_absent")
    if f_ens is not None:
        mode = "remplace"
    elif supprimer_nominatif:
        mode = "supprime"
    else:
        mode = "conserve" if jeu.nominatif_disponible else "aucun"

    anciens = depots.charger_enseignants(jeu) if jeu.nominatif_disponible else []
    l_etab, l_ens, bilan = _lignes_du_jeu(compte, f_etab, f_ens)
    if mode == "conserve":
        # Les enseignants enregistrés restent tels quels ; ils sont contrôlés face aux nouveaux établissements.
        l_ens = _lignes_des_enseignants_enregistres(anciens)
    nominatif = mode in ("remplace", "conserve")
    rapport = controler(l_etab, l_ens, cfg_dom.defaut(), nominatif=nominatif)
    if bilan is not None:
        _joindre_bilan_regional(rapport, bilan)
    if not rapport["valide"]:
        raise RefusMetier("Les données contiennent des erreurs bloquantes",
                          [e["message"] for e in rapport["erreurs"]], code="qualite_bloquante")
    ecoles = [construire_ecole(l) for l in l_etab]
    enseignants = anciens if mode == "conserve" else [construire_enseignant(l) for l in l_ens]
    ecarts = calculer_ecarts(anciens, enseignants)
    nb_ecarts = {f"nb_{k}": len(v) for k, v in ecarts.items()}
    ages = {t.matricule: t.age for t in anciens}
    for d in ecarts["departs"]:
        d["age"] = ages.get(d["matricule"])
    ecarts = {k: _tronquer(v) for k, v in ecarts.items()}
    invalidees = _invalider_decisions(jeu, {e.id for e in ecoles}, {t.matricule for t in enseignants})

    jeu.etablissements.all().delete()
    if mode != "conserve":
        jeu.enseignants.all().delete()
    depots.enregistrer(jeu, ecoles, [] if mode == "conserve" else enseignants)
    RapportQualite.objects.update_or_create(jeu=jeu, defaults={"contenu": rapport})
    for f in (f_etab, f_ens):
        if f is not None:
            f.jeu = jeu
            f.save(update_fields=["jeu"])
    avant_nominatif = jeu.nominatif_disponible
    jeu.nominatif_disponible = nominatif
    jeu.statut, jeu.valide_le, jeu.valide_par, jeu.validation_reserve = "brouillon", None, "", None
    jeu.save(update_fields=["nominatif_disponible", "statut", "valide_le", "valide_par", "validation_reserve"])
    invalider_cache(jeu)
    invalidees += _reevaluer_faits_prince(jeu)       # sur les nouvelles données : un fait impossible n'est jamais appliqué
    recalculer_scenarios(jeu)
    act = Actualisation.objects.create(
        jeu=jeu, realisee_par=auteur, fichier_etablissements=f_etab.nom_fichier,
        fichier_enseignants=f_ens.nom_fichier if f_ens is not None else "", mode_nominatif=mode,
        ecarts={**ecarts, **nb_ecarts, "decisions_invalidees": invalidees, "nb_avant": len(anciens),
                "liste_tronquee": any(n > MAX_ECARTS_DETAILLES for n in nb_ecarts.values())})
    resume = resume_actualisation(act)["resume"]
    libelle_mode = {"remplace": "nouveau fichier d'enseignants", "conserve": "enseignants enregistrés conservés",
                    "supprime": "données nominatives supprimées à la demande", "aucun": "établissements seuls"}[mode]
    journaliser(jeu, "actualisation", "réalisée",
                f"Actualisation des données ({libelle_mode}) : {resume['arrivees']} arrivée(s), "
                f"{resume['departs']} départ(s), {resume['changements_ecole']} changement(s) d'école",
                request=request, auteur=auteur, objet=("actualisation", act.pk),
                avant={"nominatif_disponible": avant_nominatif},
                apres={**resume, "mode_nominatif": mode, "nominatif_disponible": nominatif})
    marquer_obsolete(jeu, "Actualisation des données")
    return act


def resume_actualisation(a) -> dict:
    e = a.ecarts
    return {"id": str(a.pk), "realisee_le": a.realisee_le, "realisee_par": a.realisee_par or None,
            "fichiers_source": {"etablissements": a.fichier_etablissements, "enseignants": a.fichier_enseignants or None},
            "mode_nominatif": a.mode_nominatif or None,
            "resume": {"arrivees": e.get("nb_arrivees", len(e.get("arrivees", []))),
                       "departs": e.get("nb_departs", len(e.get("departs", []))),
                       "changements_ecole": e.get("nb_changements_ecole", len(e.get("changements_ecole", []))),
                       "decisions_invalidees": len(e.get("decisions_invalidees", []))}}
