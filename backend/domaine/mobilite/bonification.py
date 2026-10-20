"""Bonification ciblée : l'école visée par un motif de demande (rapprochement de conjoint, suivi médical).

Une seule règle, partagée par `score.py` (score d'un couple agent / poste) et `selection.py` (index rapide des phases 2 et
3), pour qu'elles ne divergent jamais. Elle corrige trois défauts de la règle d'origine :

- les points ne vont **qu'à l'école nommée** dans le motif : sans école identifiée, aucun point (l'ancienne règle
  bonifiait alors tous les vœux de l'agent) ;
- l'école est reconnue par **mot entier** et non par sous-chaîne : le motif « ECO12 » ne désigne pas le vœu « ECO1 » ;
- le motif doit être d'un **type reconnu** (rapprochement de conjoint, suivi médical).
"""
from __future__ import annotations

import re
from typing import Optional

from ..commun.texte import est_vide, sans_accents
from ..donnees.modeles import Enseignant

#: Fragments (sans accents, en minuscules) qui désignent un motif ouvrant droit à la bonification.
TYPES_DE_MOTIF = ("rapprochement", "conjoint", "medical", "sante")

_MOTS = re.compile(r"[^\s,;:()\[\]{}\"'’/]+")


def motif_reconnu(motif: str) -> bool:
    texte = sans_accents(motif).lower()
    return any(t in texte for t in TYPES_DE_MOTIF)


def ecole_bonifiee(e: Enseignant) -> Optional[str]:
    """Identifiant (tel qu'écrit dans les vœux) de l'école visée par le motif de l'agent, sinon `None`."""
    motif = (e.motif_bonification or "").strip()
    if est_vide(motif) or not motif_reconnu(motif):
        return None
    voeux = {v.strip().lower(): v.strip() for v in e.voeux if v and not est_vide(v)}
    for mot in _MOTS.findall(motif):
        trouve = voeux.get(mot.rstrip(".").lower())
        if trouve:
            return trouve
    return None
