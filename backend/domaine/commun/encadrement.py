"""Taux d'encadrement (élèves par enseignant) : une seule formule, utilisée partout où ce ratio est calculé
(rapport DRH, comparaison avant/après l'algorithme, projection sur cinq ans).

Convention validée (lot 4, décision « Encadrement ») : le numérateur (élèves) et le dénominateur (enseignants)
portent toujours sur la même population d'écoles — celles dont l'effectif d'élèves est connu
(`Ecole.effectif_connu`), jamais une école exclue d'un côté et incluse de l'autre. Une école dont l'effectif
d'élèves est inconnu est donc entièrement absente de l'agrégat (ni ses élèves, ni ses enseignants), au lieu de
diluer artificiellement le ratio avec des enseignants sans élèves en face. Cette convention s'applique à la
population agrégée ; elle ne change rien à la formule elle-même (Σ élèves ÷ Σ enseignants), ni au résultat d'une
école isolée (son propre effectif_connu détermine simplement si elle est incluse).

Le filtrage par `effectif_connu` est à la charge de chaque appelant (il connaît la forme de ses données :
`ProjectionEcole`, ligne `etab_enrichi`, etc.) ; ce module ne fait que la division, pour que la formule et
l'arrondi soient identiques partout.
"""
from __future__ import annotations

from typing import Optional


def taux_encadrement(eleves: float, enseignants: float, chiffres: int = 1,
                      defaut: Optional[float] = None) -> Optional[float]:
    """Élèves par enseignant, arrondi à `chiffres` décimales ; `defaut` si aucun enseignant (jamais une division
    par zéro). `defaut` diffère selon les appelants existants (`None` pour signaler « non calculable », `0.0`
    pour un affichage toujours numérique) : ce module ne tranche pas, il applique celui qu'on lui donne."""
    return round(eleves / enseignants, chiffres) if enseignants > 0 else defaut
