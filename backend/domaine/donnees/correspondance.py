"""Détection des colonnes d'un classeur (detectColumns / applyManualMapping)."""
from __future__ import annotations

import difflib
import re
from typing import Any, Dict, List

from ..commun.texte import sans_accents
from . import colonnes as C

SYNONYMES = {
    "Identifiant_Ecole": ["id_ecole", "code_ecole", "ecole", "identifiant", "id_etab", "code_etablissement"],
    "Sous_Systeme": ["sous_systeme", "soussysteme", "systeme", "sous_systeme_ecole"],
    "Region": ["region", "dreb"],
    "Departement": ["departement", "dept"],
    "Commune": ["commune", "arrondissement"],
    "Circonscription_IAEB": ["iaeb", "circonscription", "inspection", "circonscription_iaeb"],
    "Effectif_Eleves_Attendus": ["effectif", "effectif_eleves", "eleves", "ne", "nb_eleves"],
    "Enseignants_Actuels": ["enseignants", "nb_enseignants", "ee", "enseignants_en_poste"],
    "Salles_Simple_Flux": ["salles_sf", "salles_simple", "ssf"],
    "Salles_Double_Flux": ["salles_df", "salles_double", "sdf"],
    "Accessibilite_Zone": ["accessibilite", "zone", "zone_accessibilite"],
    "Securite_Zone": ["securite", "zone_securite"],
    "Classes_Multigrades": ["multigrade", "multigrades", "classes_multigrade"],
    "Classes_Ouvertes": ["classes_ouvertes", "nb_classes", "nombre_classes", "classes"],
    "Matricule_Enseignant": ["matricule", "id_enseignant", "id_ens"],
    "Sous_Systeme_Formation": ["sous_systeme_formation", "formation_sous_systeme", "sous_systeme"],
    "Ecole_Attache_Actuelle": ["ecole_actuelle", "ecole_attache", "affectation_actuelle", "ecole"],
    "Age": ["age"],
    "Anciennete_Carriere": ["anciennete", "anciennete_carriere", "anciennete_service"],
    "Anciennete_Poste_Actuel": ["anciennete_poste", "anciennete_au_poste"],
    "Annees_Zone_Difficulte_1": ["zone_difficulte_1", "annees_zone_1", "zd1"],
    "Annees_Zone_Difficulte_2": ["zone_difficulte_2", "annees_zone_2", "zd2"],
    "Situation_Matrimoniale": ["situation_familiale", "situation", "statut_matrimonial"],
    "Nombre_Enfants_A_Charge": ["enfants", "nb_enfants", "enfants_a_charge"],
    "Formations_Continues": ["formations", "nb_formations", "formation_continue"],
    "Voeu_1": ["voeu1", "voeu_un", "choix_1"],
    "Voeu_2": ["voeu2", "voeu_deux", "choix_2"],
    "Voeu_3": ["voeu3", "voeu_trois", "choix_3"],
    "Motif_Bonification": ["motif", "bonification"],
    "Motif": ["motif_decision", "observation", "justification", "raison"],
}

COLONNES_PAR_TYPE = {
    "etablissements": C.COLONNES_ATTENDUES_ETAB + C.COLONNES_OPTIONNELLES_ETAB,
    "enseignants": C.COLONNES_ATTENDUES_ENS + C.COLONNES_OPTIONNELLES_ENS,
    "prince": C.COLONNES_ATTENDUES_PRINCE,
}
OBLIGATOIRES = {"etablissements": C.COLONNES_BLOQUANTES_ETAB, "enseignants": C.COLONNES_BLOQUANTES_ENS,
                "prince": C.COLONNES_BLOQUANTES_PRINCE}
#: Colonnes qu'un fichier peut ne pas porter sans qu'on demande de les associer.
OPTIONNELLES = C.COLONNES_OPTIONNELLES_ETAB + C.COLONNES_OPTIONNELLES_ENS + C.COLONNES_OPTIONNELLES_PRINCE


def cle(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", sans_accents(str(s).strip().lower())).strip("_")


def detecter(type_fichier: str, entetes: List[str]) -> Dict[str, Any]:
    """Associe chaque colonne attendue à un en-tête du fichier. Retourne correspondance + colonnes à confirmer."""
    attendues = COLONNES_PAR_TYPE[type_fichier]
    par_cle = {}
    for h in entetes:
        par_cle.setdefault(cle(h), h)
    utilises = set()
    corr: Dict[str, str] = {}
    suggestions: Dict[str, List[str]] = {}
    for col in attendues:
        trouve = par_cle.get(cle(col))
        if trouve is None:
            for syn in SYNONYMES.get(col, []):
                if cle(syn) in par_cle and par_cle[cle(syn)] not in utilises:
                    trouve = par_cle[cle(syn)]
                    break
        if trouve is not None and trouve not in utilises:
            corr[col] = trouve
            utilises.add(trouve)
    a_confirmer = []
    for col in attendues:
        if col in corr:
            continue
        restants = [h for h in entetes if h not in utilises]
        sugg = difflib.get_close_matches(cle(col), [cle(h) for h in restants], n=3, cutoff=0.5)
        suggestions[col] = [h for h in restants if cle(h) in sugg]
        if col in OPTIONNELLES:
            continue
        a_confirmer.append({"colonne": col, "obligatoire": col in OBLIGATOIRES[type_fichier],
                            "suggestions": suggestions[col]})
    return {"correspondance": corr, "a_confirmer": a_confirmer}


def appliquer(lignes: List[Dict[str, Any]], correspondance: Dict[str, str]) -> List[Dict[str, Any]]:
    """Renomme les en-têtes sources vers les noms officiels ; ignore les colonnes non reconnues."""
    res = []
    for l in lignes:
        res.append({officiel: l.get(source) for officiel, source in correspondance.items() if source in l})
    return res
