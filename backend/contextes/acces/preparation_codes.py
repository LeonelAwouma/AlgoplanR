"""Préparation des codes des délégués (machine de l'administrateur, avec la clé privée).

Produit deux charges, à signer :
  - le **catalogue** (pour tous les postes) : vérificateurs scrypt groupés par région et par usage, aucun code ;
  - le **carnet** (pour le seul DRH) : les codes en clair, chiffrés par une phrase transmise à part.
"""
from __future__ import annotations

import json
import os
from typing import Dict, Iterable, List, Optional, Tuple

from django.utils import timezone

from domaine.acces import codes as dom
from domaine.acces.regions import CODES_REGIONS, REGIONS_CAMEROUN

from .codes_acces import FORMAT_CATALOGUE, VERSION_CATALOGUE
from .coffre import FORMAT_CARNET, VERSION_CARNET


def identifiant_entree(numero: int, region: str, usage: str, rang: int) -> str:
    return f"C{numero}-{CODES_REGIONS[region]}-{'A' if usage == 'activation' else 'R'}{rang:03d}"


def preparer(numero: int, *, activation: int, recuperation: int, phrase: str,
             regions: Iterable[str] = REGIONS_CAMEROUN, revoques: Iterable[str] = (),
             params: Optional[Dict[str, int]] = None) -> Tuple[dict, dict, List[dict]]:
    """(charge du catalogue, charge du carnet, liste des codes en clair)."""
    params = dict(params or dom.PARAMS_CATALOGUE)
    groupes, carnet = [], []
    deja: set = set()
    for region in regions:
        for usage, nombre in (("activation", activation), ("recuperation", recuperation)):
            if nombre <= 0:
                continue
            tires = dom.generer_codes(nombre, exclus=deja)
            deja.update(tires)
            codes = {identifiant_entree(numero, region, usage, i + 1): c for i, c in enumerate(tires)}
            groupes.append(dom.groupe(region, usage, codes, params))
            carnet += [{"id": i, "region": region, "usage": usage, "code": c} for i, c in codes.items()]
    emis = timezone.now().isoformat()
    catalogue = {"format": FORMAT_CATALOGUE, "version": VERSION_CATALOGUE, "numero": numero, "emis_le": emis,
                 "params": params, "groupes": groupes, "revoques": sorted(set(revoques))}
    sel = os.urandom(16)
    boite = dom.chiffrer(dom.deriver_cle(phrase, sel), json.dumps(carnet).encode("utf-8"))
    charge_carnet = {"format": FORMAT_CARNET, "version": VERSION_CARNET, "numero": numero, "emis_le": emis,
                     "sel": dom.b64(sel), "params": dict(dom.PARAMS_COFFRE), **boite}
    return catalogue, charge_carnet, carnet
