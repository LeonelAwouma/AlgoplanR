"""Lignes des bases « après Prince » : ce que l'écran affiche et ce que les classeurs Excel contiennent.

Une seule construction de lignes sert aux deux, pour que l'écran et les fichiers ne divergent jamais. Les colonnes
d'origine gardent leurs noms officiels (les deux bases peuvent être réimportées ; les colonnes ajoutées sont alors
ignorées) et les colonnes propres au Prince sont ajoutées à la suite. Matricules et identifiants restent des textes.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from ..donnees import colonnes as C
from ..donnees.modeles import Ecole, Enseignant
from .projection import ApplicationPrince, DecisionPrince, REJETE

COLONNES_ETABLISSEMENT = [C.COL_ETAB_ID, C.COL_ETAB_SS, C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE,
                          C.COL_ETAB_IAEB, C.COL_ETAB_NE, C.COL_ETAB_EE, C.COL_ETAB_SSF, C.COL_ETAB_SDF,
                          C.COL_ETAB_ALPHA, C.COL_ETAB_SIGMA, C.COL_ETAB_MULTIGRADE, "nom_etab", "type_etab",
                          "latitude", "longitude", C.COL_ETAB_CLASSES_OUVERTES]
COLONNES_ENSEIGNANT = [C.COL_ENS_ID, "nom", "prenom", C.COL_ENS_SS, C.COL_ENS_ETAB, C.COL_ENS_AGE, C.COL_ENS_ANC_CAR,
                       C.COL_ENS_ANC_POSTE, C.COL_ENS_N1, C.COL_ENS_N2, C.COL_ENS_SITU, C.COL_ENS_ENFANTS,
                       C.COL_ENS_FORM, C.COL_ENS_V1, C.COL_ENS_V2, C.COL_ENS_V3, C.COL_ENS_MOTIF]

LIBELLE_STATUT = {"applique": "Appliquée", "applique_avec_alerte": "Appliquée avec alerte", "rejete": "Rejetée"}


def _rem(e: Ecole) -> Optional[float]:
    return round(e.effectif_eleves / e.enseignants_actuels, 2) if e.enseignants_actuels else None


def lignes_etablissements(avant: Iterable[Ecole], apres: Iterable[Ecole], touchees: Iterable[str]) -> List[dict]:
    """Base établissements après Prince : colonnes d'origine (effectif mis à jour) puis avant / après."""
    touchees = set(touchees)
    lignes = []
    for av, ap in zip(avant, apres):
        d = ap.vers_dict()
        ligne = {k: d.get(k) for k in COLONNES_ETABLISSEMENT}
        ligne.update({
            "Enseignants_Avant_Prince": int(av.enseignants_actuels or 0),
            "Enseignants_Apres_Prince": int(ap.enseignants_actuels or 0),
            "REM_Avant": _rem(av), "REM_Apres": _rem(ap),
            "Besoin_Avant": int(av.ind.be), "Besoin_Apres": int(ap.ind.be),
            "Touche_Par_Prince": "OUI" if ap.id in touchees else "NON",
        })
        lignes.append(ligne)
    return lignes


def _decision_par_matricule(decisions: Iterable[DecisionPrince]) -> Dict[str, DecisionPrince]:
    """Une décision par matricule : celle qui a été appliquée, sinon la première."""
    res: Dict[str, DecisionPrince] = {}
    for d in decisions:
        if d.id_ens not in res or (res[d.id_ens].statut == REJETE and d.statut != REJETE):
            res[d.id_ens] = d
    return res


def lignes_enseignants(avant: Iterable[Enseignant], apres: Iterable[Enseignant],
                       decisions: Iterable[DecisionPrince], regions: Optional[Dict[str, str]] = None) -> List[dict]:
    """Base enseignants après Prince : `Ecole_Attache_Actuelle` est l'école après la décision, l'école d'origine est
    conservée dans `Ecole_Origine_Prince`. `Ecole_Initiale` / `Region_Initiale` (fichier importé) et
    `Region_Apres_Decision` lèvent l'ambiguïté d'un agent déplacé hors de sa région : l'ancienne région reste lisible
    et filtrable. `regions` : région de chaque école (elle ne change pas avec les faits du Prince)."""
    par_mat = _decision_par_matricule(decisions)
    regions = regions or {}
    lignes = []
    for av, ap in zip(avant, apres):
        d = ap.vers_dict()
        ligne = {k: d.get(k) for k in COLONNES_ENSEIGNANT}
        dec = par_mat.get(ap.matricule)
        ligne.update({
            "Ecole_Initiale": av.ecole_attache, "Region_Initiale": regions.get(av.ecole_attache, ""),
            "Region_Apres_Decision": regions.get(ap.ecole_attache, ""),
            "Ecole_Origine_Prince": av.ecole_attache if dec else "",
            "Ecole_Affectation_Prince": dec.id_destination if dec else "",
            "Statut_Prince": LIBELLE_STATUT[dec.statut] if dec else "",
            "Reference_Decision": dec.motif if dec else "",
        })
        lignes.append(ligne)
    return lignes


def lignes_journal(application: Optional[ApplicationPrince], ecoles_avant: Dict[str, Ecole],
                   enseignants_avant: Dict[str, Enseignant]) -> List[dict]:
    """Journal des décisions : appliquées, appliquées avec alerte, rejetées, avec motifs et impact par école."""
    if application is None:
        return []

    def nom(e: Optional[Ecole], ident: str) -> str:
        return (e.nom or e.id) if e is not None else ident

    lignes = []
    for d in application.decisions:
        t = enseignants_avant.get(d.id_ens)
        o, c = ecoles_avant.get(d.id_origine), ecoles_avant.get(d.id_destination)
        ligne = {
            "Ordre": d.ordre, "Matricule_Enseignant": d.id_ens,
            "Nom_Enseignant": f"{t.nom} {t.prenom}".strip() if t else "",
            "Ecole_Origine": d.id_origine, "Nom_Ecole_Origine": nom(o, d.id_origine),
            "Ecole_Destination": d.id_destination, "Nom_Ecole_Destination": nom(c, d.id_destination),
            "Statut": LIBELLE_STATUT[d.statut], "Alertes": " ; ".join(d.alertes),
            "Motifs_Rejet": " ; ".join(d.rejets), "Reference_Decision": d.motif,
        }
        for cle, ident in (("Origine", d.id_origine), ("Destination", d.id_destination)):
            av, ap = application.ecoles_avant.get(ident), application.ecoles_apres.get(ident)
            applique = d.statut != REJETE and av is not None and ap is not None
            ligne[f"Enseignants_{cle}_Avant"] = int(av.enseignants_actuels) if applique else None
            ligne[f"Enseignants_{cle}_Apres"] = int(ap.enseignants_actuels) if applique else None
            ligne[f"Besoin_{cle}_Avant"] = int(av.ind.be) if applique else None
            ligne[f"Besoin_{cle}_Apres"] = int(ap.ind.be) if applique else None
        lignes.append(ligne)
    return lignes


def feuille_information(titre: str, empreinte: str, genere_le: str, resume: Dict[str, int]) -> List[dict]:
    """Feuille « Information » : ce que le classeur est, et ce qu'il n'est pas."""
    return [
        {"Rubrique": "Document", "Valeur": titre},
        {"Rubrique": "Nature", "Valeur": "Base dérivée pour simulation : les décisions du Prince y sont appliquées "
                                         "aux données importées. Ce n'est pas une décision administrative mise en "
                                         "œuvre."},
        {"Rubrique": "Généré le", "Valeur": genere_le},
        {"Rubrique": "Empreinte des données et des décisions", "Valeur": empreinte},
        {"Rubrique": "Décisions identifiées", "Valeur": resume["identifiees"]},
        {"Rubrique": "Décisions appliquées", "Valeur": resume["appliquees"]},
        {"Rubrique": "dont avec alerte", "Valeur": resume["avec_alerte"]},
        {"Rubrique": "Décisions rejetées", "Valeur": resume["rejetees"]},
    ]
