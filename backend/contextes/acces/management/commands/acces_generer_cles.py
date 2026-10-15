"""Génère la paire de clés Ed25519 de l'administration (à exécuter sur la machine de l'administrateur).

    python manage.py acces_generer_cles --dossier D:\\AlgoPlanR-admin [--sans-phrase] [--installer]

La clé privée reste hors du dépôt et hors des postes : elle seule permet de préparer des fichiers d'activation.
La clé publique est copiée dans contextes/acces/cle_publique_activation.pem (option --installer, ou à la main)
avant de construire l'application.
"""
from __future__ import annotations

import getpass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

CLE_EMBARQUEE = Path(settings.BASE_DIR) / "contextes" / "acces" / "cle_publique_activation.pem"


class Command(BaseCommand):
    help = "Génère la paire de clés Ed25519 qui signe les fichiers d'activation AlgoPlanR."

    def add_arguments(self, parser):
        parser.add_argument("--dossier", required=True, help="Dossier hors du dépôt où écrire les clés")
        parser.add_argument("--sans-phrase", action="store_true",
                            help="Ne pas chiffrer la clé privée (développement uniquement)")
        parser.add_argument("--installer", action="store_true",
                            help="Copier la clé publique dans contextes/acces/cle_publique_activation.pem")
        parser.add_argument("--ecraser", action="store_true", help="Remplacer des clés déjà présentes")

    def handle(self, *args, **o):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        dossier = Path(o["dossier"]).expanduser().resolve()
        depot = Path(settings.BASE_DIR).resolve().parent
        if dossier == depot or depot in dossier.parents:
            raise CommandError("La clé privée ne doit jamais être écrite dans le dépôt AlgoPlanR : "
                               "choisissez un dossier extérieur.")
        privee, publique = dossier / "cle_privee_activation.pem", dossier / "cle_publique_activation.pem"
        if privee.exists() and not o["ecraser"]:
            raise CommandError(f"{privee} existe déjà (--ecraser pour la remplacer).")
        if o["sans_phrase"]:
            chiffrement = serialization.NoEncryption()
        else:
            phrase = getpass.getpass("Phrase secrète protégeant la clé privée : ")
            if len(phrase) < 12 or phrase != getpass.getpass("Confirmez la phrase secrète : "):
                raise CommandError("Phrase secrète trop courte (12 caractères au moins) ou confirmation différente.")
            chiffrement = serialization.BestAvailableEncryption(phrase.encode("utf-8"))
        cle = Ed25519PrivateKey.generate()
        dossier.mkdir(parents=True, exist_ok=True)
        privee.write_bytes(cle.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                             chiffrement))
        pem_publique = cle.public_key().public_bytes(serialization.Encoding.PEM,
                                                     serialization.PublicFormat.SubjectPublicKeyInfo)
        publique.write_bytes(pem_publique)
        self.stdout.write(f"Clé privée  : {privee}  (à conserver hors des postes, sauvegardée en lieu sûr)")
        self.stdout.write(f"Clé publique: {publique}")
        if o["installer"]:
            CLE_EMBARQUEE.write_bytes(pem_publique)
            self.stdout.write(f"Clé publique installée dans {CLE_EMBARQUEE}")
        else:
            self.stdout.write(f"Copiez la clé publique dans {CLE_EMBARQUEE} avant de construire l'application.")
