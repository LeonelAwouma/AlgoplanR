"""Jeu de démonstration reproductible (générateur à graine, Python pur)."""
from __future__ import annotations

import random
from typing import Dict, List, Tuple

from . import colonnes as C

GEO = {
    "Nord": {"Benoue": ["Garoua 1", "Garoua 2", "Pitoa"], "Mayo-Louti": ["Guider", "Figuil"]},
    "Extreme-Nord": {"Diamare": ["Maroua 1", "Maroua 2", "Meri"], "Mayo-Tsanaga": ["Mokolo", "Hina"]},
    "Centre": {"Mfoundi": ["Yaounde 1", "Yaounde 2"], "Lekie": ["Obala", "Monatele"]},
}
PRENOMS = ["Paul", "Marie", "Jean", "Aicha", "Ibrahim", "Esther", "Moussa", "Berthe", "Samuel", "Fatima"]
NOMS = ["Mbarga", "Njoya", "Abba", "Tchinda", "Bello", "Ekani", "Hamadou", "Fouda", "Ngo", "Oumarou"]


def construire_jeu_demonstration(graine: int = 2026, nb_ecoles: int = 60,
                                 nb_enseignants: int = 420) -> Tuple[List[Dict], List[Dict]]:
    rnd = random.Random(graine)
    communes = [(r, d, c) for r, ds in GEO.items() for d, cs in ds.items() for c in cs]
    ecoles: List[Dict] = []
    for k in range(nb_ecoles):
        r, d, c = communes[k % len(communes)]
        zone = rnd.choices(["Urbain", "Semi-urbain", "Rural", "Enclave"], [3, 2, 4, 1])[0]
        sec = rnd.choices(["Verte", "Jaune", "Rouge"], [7, 2, 1])[0]
        multigrade = "Oui" if rnd.random() < 0.25 else "Non"
        attendu = rnd.choice([40, 80, 140, 200, 260, 320, 400])
        besoin_th = max(6, -(-(attendu - 20) // 60)) if multigrade == "Non" else 6
        ecoles.append({
            C.COL_ETAB_ID: f"ECO{k + 1:03d}", C.COL_ETAB_SS: "Anglophone" if rnd.random() < 0.15 else "Francophone",
            C.COL_ETAB_REGION: r, C.COL_ETAB_DEPT: d, C.COL_ETAB_COMMUNE: c,
            C.COL_ETAB_IAEB: f"IAEB {c}", C.COL_ETAB_NE: attendu,
            C.COL_ETAB_EE: max(0, besoin_th + rnd.randint(-4, 5)),
            C.COL_ETAB_SSF: rnd.randint(2, 8), C.COL_ETAB_SDF: rnd.randint(0, 3),
            C.COL_ETAB_ALPHA: zone, C.COL_ETAB_SIGMA: sec, C.COL_ETAB_MULTIGRADE: multigrade,
            "nom_etab": f"Ecole publique de {c} n°{k + 1}", "type_etab": "ECOLE",
        })
    ids = [e[C.COL_ETAB_ID] for e in ecoles]
    ens: List[Dict] = []
    for k in range(nb_enseignants):
        ecole = ecoles[rnd.randrange(len(ecoles))]
        age = rnd.randint(24, 62)
        anc_car = max(0, min(age - 22, rnd.randint(1, 35)))
        voeux = rnd.sample(ids, 3) if rnd.random() < 0.7 else ["", "", ""]
        ens.append({
            C.COL_ENS_ID: f"MAT{k + 1:05d}", "nom": rnd.choice(NOMS), "prenom": rnd.choice(PRENOMS),
            C.COL_ENS_SS: ecole[C.COL_ETAB_SS], C.COL_ENS_ETAB: ecole[C.COL_ETAB_ID], C.COL_ENS_AGE: age,
            C.COL_ENS_ANC_CAR: anc_car, C.COL_ENS_ANC_POSTE: rnd.randint(0, min(anc_car, 15)),
            C.COL_ENS_N1: rnd.choice([0, 0, 2, 4]), C.COL_ENS_N2: rnd.choice([0, 0, 3, 6]),
            C.COL_ENS_SITU: rnd.choice(["Célibataire", "Marié(e)", "Divorcé(e)", "Veuf(ve)"]),
            C.COL_ENS_ENFANTS: rnd.randint(0, 6), C.COL_ENS_FORM: rnd.randint(0, 6),
            C.COL_ENS_V1: voeux[0], C.COL_ENS_V2: voeux[1], C.COL_ENS_V3: voeux[2],
            C.COL_ENS_MOTIF: "Rapprochement familial" if rnd.random() < 0.05 else "",
        })
    return ecoles, ens
