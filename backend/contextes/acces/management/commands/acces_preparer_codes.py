"""Prépare un catalogue de codes des délégués et le carnet du DRH (machine de l'administrateur, clé privée).

Exemples :
    # Catalogue n° 1 : 10 codes d'activation et 10 de récupération par région, embarqués dans l'installation
    python manage.py acces_preparer_codes --cle-privee D:\\admin\\cle_privee_activation.pem --numero 1 \\
        --sortie-catalogue contextes\\acces\\catalogue_codes.algoplanr-catalogue \\
        --sortie-carnet contextes\\acces\\carnet_codes.algoplanr-carnet --sortie-cle D:\\admin\\cle-carnet-1.txt

    # Catalogue n° 2 : nouveaux codes de récupération, révocation de deux codes (les autres restent valables)
    python manage.py acces_preparer_codes ... --numero 2 --activation 0 --recuperation 5 \\
        --revoquer C1-CEN-A003 --revoquer C1-LIT-R001 ...

Le catalogue ne contient que des vérificateurs (scrypt) et le carnet les codes chiffrés : tous deux sont embarqués
dans l'installation (contextes/acces/). La clé du carnet, tirée au hasard, est écrite dans `--sortie-cle` : elle ne
va dans aucune installation, seulement dans le fichier d'activation du DRH (acces_preparer_activation
--cle-carnet). Aucun code n'expire.
"""
from __future__ import annotations

import secrets
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from contextes.acces.activation import signer
from contextes.acces.preparation_codes import preparer
from domaine.acces.codes import PARAMS_CATALOGUE
from domaine.acces.regions import REGIONS_CAMEROUN, region_canonique

from .acces_preparer_activation import cle_privee_pem


class Command(BaseCommand):
    help = "Prépare le catalogue signé des codes des délégués et le carnet chiffré du DRH."

    def add_arguments(self, parser):
        parser.add_argument("--cle-privee", required=True)
        parser.add_argument("--numero", type=int, required=True, help="Numéro du catalogue (croissant)")
        parser.add_argument("--activation", type=int, default=10, help="Codes d'activation par région")
        parser.add_argument("--recuperation", type=int, default=10, help="Codes de récupération par région")
        parser.add_argument("--region", action="append", default=[], help="Limiter à une ou plusieurs régions")
        parser.add_argument("--revoquer", action="append", default=[], help="Identifiant d'entrée à révoquer")
        parser.add_argument("--phrase", help="Clé du carnet (tirée au hasard si absente)")
        parser.add_argument("--sortie-cle", required=True, help="Fichier secret recevant la clé du carnet")
        parser.add_argument("--n", type=int, default=PARAMS_CATALOGUE["n"], help="Coût scrypt (puissance de 2)")
        parser.add_argument("--sortie-catalogue", required=True)
        parser.add_argument("--sortie-carnet", required=True)

    def handle(self, *args, **o):
        if o["numero"] < 1:
            raise CommandError("Le numéro du catalogue doit être positif.")
        regions = [region_canonique(r) for r in o["region"]] or list(REGIONS_CAMEROUN)
        if None in regions:
            raise CommandError("Région inconnue.")
        phrase = o["phrase"] or secrets.token_urlsafe(32)
        if len(phrase) < 12:
            raise CommandError("La clé du carnet doit compter au moins 12 caractères.")
        catalogue, carnet, codes = preparer(o["numero"], activation=o["activation"], recuperation=o["recuperation"],
                                            phrase=phrase, regions=regions, revoques=o["revoquer"],
                                            params={**PARAMS_CATALOGUE, "n": o["n"]})
        cle = cle_privee_pem(o["cle_privee"])
        Path(o["sortie_catalogue"]).write_bytes(signer(catalogue, cle))
        Path(o["sortie_carnet"]).write_bytes(signer(carnet, cle))
        self.stdout.write(f"Catalogue n° {o['numero']} : {len(codes)} code(s) pour {len(regions)} région(s), "
                          f"{len(catalogue['revoques'])} révoqué(s) -> {o['sortie_catalogue']}")
        Path(o["sortie_cle"]).write_text(phrase, encoding="utf-8")
        self.stdout.write(f"Carnet chiffré -> {o['sortie_carnet']} ; clé du carnet (secrète) -> {o['sortie_cle']}")
