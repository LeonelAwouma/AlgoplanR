"""Rattachement prudent des jeux enregistrés avant le contrôle des accès (migration donnees 0002).

Aucune donnée n'est supprimée ni modifiée : seuls les champs `portee` et `region` du jeu sont renseignés.
- Toutes les écoles du jeu relèvent d'une même région reconnue : jeu régional de cette région.
- Sinon (plusieurs régions, région inconnue ou absente, jeu vide) : jeu « national hérité », visible du seul DRH,
  en lecture seule.
"""
from __future__ import annotations

from typing import Iterable, Optional, Tuple

from domaine.acces.regions import region_canonique

from .perimetre import PORTEE_HERITEE, PORTEE_REGIONALE


def classer(regions_brutes: Iterable) -> Tuple[str, Optional[str]]:
    """(portee, region) d'un jeu d'après les régions de ses écoles."""
    reconnues = set()
    for brute in regions_brutes:
        r = region_canonique(brute)
        if r is None:
            return PORTEE_HERITEE, None
        reconnues.add(r)
    if len(reconnues) == 1:
        return PORTEE_REGIONALE, reconnues.pop()
    return PORTEE_HERITEE, None


def rattacher(ModeleJeu, ModeleEtablissement) -> dict:
    """Classe chaque jeu sans portée ; renvoie le décompte. Modèles passés en paramètre (modèles historiques)."""
    bilan = {PORTEE_REGIONALE: 0, PORTEE_HERITEE: 0}
    for jeu in ModeleJeu.objects.filter(portee=""):
        regions = (ModeleEtablissement.objects.filter(jeu_id=jeu.pk).values_list("region", flat=True).distinct())
        portee, region = classer(regions)
        jeu.portee, jeu.region = portee, region
        jeu.save(update_fields=["portee", "region"])
        bilan[portee] += 1
    return bilan
