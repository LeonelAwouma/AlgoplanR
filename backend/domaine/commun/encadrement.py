"""Taux d'encadrement (élèves par enseignant) : une seule formule, utilisée partout où ce ratio est calculé
(rapport DRH, comparaison avant/après l'algorithme, projection sur cinq ans).

Convention validée (lot 4, décision « Encadrement ») : le numérateur (élèves) et le dénominateur (enseignants)
portent toujours sur la même population d'écoles — celles dont l'effectif d'élèves est connu
(`Ecole.effectif_connu`), jamais une école exclue d'un côté et incluse de l'autre. Une école dont l'effectif
d'élèves est inconnu est donc entièrement absente de l'agrégat (ni ses élèves, ni ses enseignants), au lieu de
diluer artificiellement le ratio avec des enseignants sans élèves en face. Cette convention s'applique à la
population agrégée ; elle ne change rien à la formule elle-même (Σ élèves ÷ Σ enseignants), ni au résultat d'une
école isolée (son propre effectif_connu détermine simplement si elle est incluse).

`encadrement_population` applique ce filtre et la division ; `taux_encadrement` ne fait que la division (pour un
agrégat déjà sommé). La formule, la population et l'arrondi (`CHIFFRES_ENCADREMENT`) sont ainsi identiques partout.
"""
from __future__ import annotations

from typing import Iterable, NamedTuple, Optional, Tuple

#: Précision d'affichage unique du taux d'encadrement (élèves par enseignant) : une décimale, comme le rapport
#: DRH de référence (« 74,3 »). Tout arrondi du ratio passe par `taux_encadrement` ; aucun appelant ne fixe la sienne.
CHIFFRES_ENCADREMENT = 1
UNITE_ENCADREMENT = "élèves par enseignant"


def ratio_encadrement(eleves: float, enseignants: float, defaut: Optional[float] = None) -> Optional[float]:
    """Élèves par enseignant SANS arrondi : la valeur des calculs intermédiaires (classements, écarts, seuils). Seule
    la restitution arrondit (`taux_encadrement`) : on n'enchaîne jamais un calcul sur une valeur déjà arrondie."""
    return eleves / enseignants if enseignants > 0 else defaut


def taux_encadrement(eleves: float, enseignants: float, chiffres: int = CHIFFRES_ENCADREMENT,
                     defaut: Optional[float] = None) -> Optional[float]:
    """Élèves par enseignant, arrondi à `chiffres` décimales (`CHIFFRES_ENCADREMENT` par défaut) ; `defaut` si aucun
    enseignant (jamais une division par zéro). `defaut` diffère selon les appelants existants (`None` pour
    signaler « non calculable », `0.0` pour un affichage toujours numérique) : ce module ne tranche pas, il
    applique celui qu'on lui donne."""
    return round(eleves / enseignants, chiffres) if enseignants > 0 else defaut


class Encadrement(NamedTuple):
    """Σ élèves, Σ enseignants et taux d'une population d'écoles à effectif d'élèves connu (`taux` arrondi pour la
    restitution, `brut` non arrondi pour la suite des calculs)."""
    eleves: float
    enseignants: float
    taux: Optional[float]
    brut: Optional[float] = None


def encadrement_population(ecoles: Iterable[Tuple[bool, float, float]], defaut: Optional[float] = None) -> Encadrement:
    """Taux d'encadrement d'un ensemble d'écoles décrites par `(effectif_connu, élèves, enseignants)` : seules les
    écoles à l'effectif d'élèves connu entrent dans les deux sommes — la population commune au numérateur et au
    dénominateur (décision « Encadrement », lot 4). C'est LA fonction d'agrégation : le filtre `effectif_connu` n'est
    plus à la charge de chaque appelant, qui ne fait que décrire ses écoles."""
    eleves = enseignants = 0.0
    for connu, e, n in ecoles:
        if connu:
            eleves += float(e or 0)
            enseignants += float(n or 0)
    return Encadrement(eleves, enseignants, taux_encadrement(eleves, enseignants, defaut=defaut),
                       ratio_encadrement(eleves, enseignants, defaut=defaut))
