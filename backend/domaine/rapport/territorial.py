"""Indicateurs territoriaux du lot 4 : couverture des besoins (E10), degré d'aléa qualifié (E5) et couverture
PAREC, calculés école par école puis agrégés par somme — jamais par moyenne des ratios d'un niveau sur l'autre.

Ce module est pur (aucun accès Django, aucune lecture de base) : il reçoit des lignes déjà construites par
`contextes/rapports/rapport_territorial.py` à partir des bases du jeu (import, après Prince, après simulation),
et renvoie des agrégats prêts à être exposés. Toute formule ici correspond à une définition du registre
(voir `REGISTRE_INDICATEURS`), affichée en note de bas de tableau par les exports.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

SANS_OBJET = "sans_objet"
NON_CALCULABLE = "non_calculable"
INDICATIF = "indicatif"
NORMAL = "normal"

#: Seuils du degré d'aléa (E5) : en dessous, non calculable ; jusqu'au second, qualifié « indicatif ».
SEUIL_ALEA_NON_CALCULABLE = 3
SEUIL_ALEA_INDICATIF = 10


@dataclass(frozen=True)
class LigneEcoleCouverture:
    """Les trois situations d'une école nécessaires aux deux indicateurs de couverture (E10).

    `besoin_initial` et `effectif_initial` : à l'import (avant les faits du Prince, avant tout scénario) — la
    base reste constante quelle que soit la situation comparée ensuite.
    `besoin_apres_prince` et `effectif_apres_prince` : après application des seuls faits du Prince actifs.
    `effectif_apres_simulation` : après les faits du Prince et les affectations ordinaires du scénario retenu.
    """
    id: str
    besoin_initial: int
    effectif_initial: float
    besoin_apres_prince: int
    effectif_apres_prince: float
    effectif_apres_simulation: float


def _agreger_couverture(num: float, den: float, raison_sans_objet: str) -> dict:
    if den <= 0:
        return {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET, "raison": raison_sans_objet}
    return {"numerateur": round(num, 2), "denominateur": round(den, 2), "taux": round(num / den * 100, 1),
            "statut": NORMAL, "raison": None}


def couverture_globale(lignes: Iterable[LigneEcoleCouverture]) -> dict:
    """E10, indicateur 1 : proportion des postes manquants à l'import réellement résorbés à la situation comparée
    (ici : après simulation), sur une base de besoin fixée une fois pour toutes à l'import.

    `postes_résorbés(école) = min(besoin_initial, max(0, effectif_apres_simulation − effectif_initial))` — le
    gain net de l'école est plafonné à son propre déficit initial : un surplus dans une école ne compense jamais
    le déficit d'une autre, et une école sans besoin initial ne contribue jamais au numérateur même si elle
    reçoit du personnel. Une perte d'effectif ne compte jamais négativement (`max(0, …)`).
    """
    num = den = 0.0
    for l in lignes:
        gain = max(0.0, l.effectif_apres_simulation - l.effectif_initial)
        num += min(l.besoin_initial, gain)
        den += l.besoin_initial
    return _agreger_couverture(num, den, "Aucun besoin initial sur ce périmètre")


def couverture_operationnelle(lignes: Iterable[LigneEcoleCouverture]) -> dict:
    """E10, indicateur 2 : proportion des postes encore à pourvoir après les faits du Prince qui sont
    effectivement couverts par les affectations ordinaires du scénario (hors effet du Prince lui-même).

    `couverts(école) = min(besoin_apres_prince, max(0, effectif_apres_simulation − effectif_apres_prince))` —
    même plafonnement par école, pour la même raison. Une école dont le Prince a déjà comblé tout le besoin
    (`besoin_apres_prince = 0`) ne pèse ni au numérateur ni au dénominateur : son amélioration est imputée au
    Prince, jamais aux affectations ordinaires.
    """
    num = den = 0.0
    for l in lignes:
        affectation_ordinaire = max(0.0, l.effectif_apres_simulation - l.effectif_apres_prince)
        num += min(l.besoin_apres_prince, affectation_ordinaire)
        den += l.besoin_apres_prince
    return _agreger_couverture(num, den, "Aucun besoin après Prince sur ce périmètre")


# --- Degré d'aléa qualifié (E5) -------------------------------------------------------------------------------

def qualifier_alea(nb_ecoles_renseignees: int) -> str:
    """Statut de fiabilité du degré d'aléa selon le nombre d'écoles à effectif d'élèves connu du périmètre."""
    if nb_ecoles_renseignees < SEUIL_ALEA_NON_CALCULABLE:
        return NON_CALCULABLE
    if nb_ecoles_renseignees < SEUIL_ALEA_INDICATIF:
        return INDICATIF
    return NORMAL


def alea_qualifie(alea: Optional[float], raison: Optional[str], nb_ecoles_renseignees: int) -> dict:
    """Enveloppe `(valeur, raison)` de `domaine.planification.rapport.alea_et_raison` avec son statut de
    fiabilité (E5) : « non_calculable » sous 3 écoles renseignées, « indicatif » de 3 à 9, « normal » à partir de
    10 — sans jamais laisser entendre une fiabilité statistique garantie au-delà de ce seuil."""
    statut = qualifier_alea(nb_ecoles_renseignees)
    if statut == NON_CALCULABLE:
        return {"valeur": None, "statut": statut, "raison": raison or "Moins de 3 écoles avec un effectif d'élèves connu"}
    return {"valeur": alea, "statut": statut, "raison": raison}


# --- Couverture PAREC -------------------------------------------------------------------------------------------

#: Seuils de la couverture « au sens PAREC » : écoles de plus de 100 élèves, au moins 3 enseignants déclarés
#: (`Enseignants_Actuels`, sans distinction de statut — voir la décision « Couverture PAREC », lot 4).
SEUIL_ELEVES_PAREC = 100
SEUIL_ENSEIGNANTS_PAREC = 3


@dataclass(frozen=True)
class LigneEcoleParec:
    id: str
    eleves: float
    enseignants: float


def couverture_parec(lignes: Iterable[LigneEcoleParec]) -> dict:
    """Part des écoles de plus de 100 élèves qui ont au moins 3 enseignants (`Enseignants_Actuels`).

    Formule distincte de la couverture des besoins (E10) : ici, le dénominateur est un nombre d'écoles, pas un
    nombre de postes. Sans école de plus de 100 élèves dans le périmètre, l'indicateur est « sans objet »."""
    grandes = [l for l in lignes if l.eleves > SEUIL_ELEVES_PAREC]
    den = len(grandes)
    if den == 0:
        return {"numerateur": 0, "denominateur": 0, "taux": None, "statut": SANS_OBJET,
                "raison": "Aucune école de plus de 100 élèves sur ce périmètre"}
    num = sum(1 for l in grandes if l.enseignants >= SEUIL_ENSEIGNANTS_PAREC)
    return {"numerateur": num, "denominateur": den, "taux": round(num / den * 100, 1), "statut": NORMAL,
            "raison": None}


# --- Registre des définitions --------------------------------------------------------------------------------

REGISTRE_INDICATEURS: List[dict] = [
    {
        "code": "encadrement", "intitule": "Taux d'encadrement",
        "formule": "Σ élèves ÷ Σ enseignants, écoles à effectif d'élèves connu (mêmes écoles aux deux termes)",
        "population": "Écoles du périmètre dont l'effectif d'élèves est connu (Ecole.effectif_connu)",
        "source": "domaine.commun.encadrement.taux_encadrement",
        "limites": "Une école à l'effectif d'élèves inconnu est hors de l'agrégat, élèves et enseignants ensemble.",
    },
    {
        "code": "couverture_globale", "intitule": "Couverture globale des besoins initiaux",
        "formule": "Σ min(besoin_initial, max(0, effectif(t) − effectif_initial)) ÷ Σ besoin_initial",
        "population": "Écoles du périmètre, base de besoin fixée à l'import (avant Prince, avant scénario)",
        "source": "domaine.rapport.territorial.couverture_globale",
        "limites": ("Crédite les corrections du Prince (non distinguées des affectations ordinaires) ; un "
                   "déficit créé par le Prince dans une école sans besoin initial n'est jamais vu par cet "
                   "indicateur (base constante)."),
    },
    {
        "code": "couverture_operationnelle", "intitule": "Couverture opérationnelle après Prince",
        "formule": "Σ min(besoin_après_Prince, max(0, effectif_simulation − effectif_après_Prince)) ÷ Σ besoin_après_Prince",
        "population": "Écoles du périmètre, besoin recalculé après les faits du Prince actifs",
        "source": "domaine.rapport.territorial.couverture_operationnelle",
        "limites": "Exclut l'effet du Prince du numérateur ; disponible seulement à la situation « après simulation ».",
    },
    {
        "code": "couverture_parec", "intitule": "Couverture des écoles de plus de 100 élèves",
        "formule": "Écoles de plus de 100 élèves avec ≥ 3 enseignants (Enseignants_Actuels) ÷ écoles de plus de 100 élèves",
        "population": "Écoles de plus de 100 élèves du périmètre",
        "source": "domaine.rapport.territorial.couverture_parec",
        "limites": ("Calculée sur tous les enseignants déclarés, sans distinguer les maîtres des parents (donnée "
                   "absente du jeu) : à ne pas confondre avec la définition PAREC d'origine."),
    },
    {
        "code": "attrition", "intitule": "Attrition (modèle M1)",
        "formule": "Taux appliqué à l'effectif de début d'année (M1 : Effectif(t+1) − Recrues(t+1) = β × Effectif(t))",
        "population": "Écoles du périmètre",
        "source": "domaine.planification.projection.calculer_annees / origine_taux",
        "limites": ("Hypothèse nationale ou régionale (jamais observée à ce niveau), héritée de la région sous le "
                   "niveau régional. Les références M1 (3,33 % ± 0,41 pt, SIGE 2018-2019 à 2024-2025) ne sont "
                   "affichées qu'aux niveaux national et régional."),
    },
    {
        "code": "alea", "intitule": "Degré d'aléa",
        "formule": "1 − R² de la régression (enseignants ~ élèves), écoles à effectif d'élèves connu",
        "population": "Écoles du périmètre à effectif d'élèves connu",
        "source": "domaine.planification.rapport.alea_et_raison + domaine.rapport.territorial.alea_qualifie",
        "limites": ("Non calculable sous 3 écoles renseignées ; qualifié « indicatif » de 3 à 9 ; calcul normal à "
                   "partir de 10, sans que cela garantisse une fiabilité statistique au-delà de ce seuil."),
    },
]
