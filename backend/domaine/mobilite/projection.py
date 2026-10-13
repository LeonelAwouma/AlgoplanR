"""Projections pluriannuelles N à N+3 — portage de generer_projections_n3."""
from __future__ import annotations

import math
from typing import Dict, List

from ..donnees.modeles import Ecole, Enseignant

AGE_RETRAITE = 60
TAUX_ATTRITION = 0.02


def generer_projections_n3(ecoles: List[Ecole], vivier: List[Enseignant], affectations: List[dict]) -> List[dict]:
    par_ecole: Dict[str, List[Enseignant]] = {}
    for e in vivier:
        par_ecole.setdefault(e.ecole_attache, []).append(e)
    arrivants_par_etab: Dict[str, List[str]] = {}
    for a in affectations:
        arrivants_par_etab.setdefault(str(a["id_etab"]), []).append(a["id_ens"])
    ids_affectes = {a["id_ens"] for a in affectations}

    res = []
    for r in ecoles:
        id_etab = r.id
        arrivants = arrivants_par_etab.get(id_etab, [])
        initial = par_ecole.get(id_etab, [])
        sortants: List[str] = []
        if initial and affectations:
            ids_arr = set(arrivants)
            sortants = [e.matricule for e in initial if e.matricule in ids_affectes and e.matricule not in ids_arr]

        r1 = r2 = r3 = 0
        if initial:
            ages = [float(e.age or 0) for e in initial]
            r1 = sum(1 for a in ages if a >= AGE_RETRAITE - 1)
            r2 = sum(1 for a in ages if a == AGE_RETRAITE - 2)
            r3 = sum(1 for a in ages if a == AGE_RETRAITE - 3)

        i = r.ind
        eff_n = float(r.enseignants_actuels or 0)
        eff_projet = eff_n + len(arrivants) - len(sortants)
        attr1 = int(math.ceil(max(0, eff_projet) * TAUX_ATTRITION))
        attr2 = int(math.ceil(max(0, eff_projet - r1) * TAUX_ATTRITION))
        attr3 = int(math.ceil(max(0, eff_projet - r1 - r2) * TAUX_ATTRITION))

        besoin_n = int(i.be or 0)
        rt_n = max(0, besoin_n - len(arrivants))
        besoin_n1 = max(0, float(i.Ke or 0) - (eff_projet - r1 - attr1))
        quota_n2 = max(0, besoin_n1 + r2 + attr2)
        quota_n3 = max(0, quota_n2 + r3 + attr3)

        res.append({
            "Identifiant_Ecole": id_etab,
            "Sous_Systeme": r.sous_systeme or "Francophone",
            "Poids_Du_Poste (Up)": round(float(i.Up or 0), 2),
            "Capacite_Physique (BMAX)": int(i.BMAX or 0),
            "Dotation_Theorique (De)": int(i.De or 0),
            "Besoin_Ouvert_N (be)": besoin_n,
            "Excedent_Mobilisable_N (xe)": int(i.xe or 0),
            "Enseignants_Arrivants_N": ", ".join(str(a) for a in arrivants) if arrivants else "N/A",
            "Enseignants_Sortants_N": ", ".join(str(s) for s in sortants) if sortants else "N/A",
            "Salles_Manquantes_N (se)": int(i.se or 0),
            "Besoin_Residuel_Net_N (RT)": rt_n,
            "Departs_Retraite_N+1": r1,
            "Attrition_Previsible_N+1": attr1,
            "Affectations_Differees_N+1": "N/A",
            "Besoin_Projete_N+1": int(besoin_n1),
            "Departs_Retraite_N+2": r2,
            "Projection_Vivier_N+2": "N/A",
            "Salles_Manquantes_Projetees_N+2": int(i.se or 0),
            "Quota_Recrutement_Estime_N+2": int(quota_n2),
            "Departs_Retraite_N+3": r3,
            "Attrition_Previsible_N+3": attr3,
            "Besoin_Minimal_Completude_N+3": int(i.De or 0),
            "Quota_Recrutement_Estime_N+3": int(quota_n3),
        })
    return res
