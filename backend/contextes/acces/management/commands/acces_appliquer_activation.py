"""Applique un fichier d'activation signé sur ce poste (même contrôle de signature que l'écran d'activation).

    python manage.py acces_appliquer_activation activation-initiale.algoplanr-activation
"""
from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from contextes.acces.activation import appliquer
from contextes.commun.erreurs import RefusMetier


class Command(BaseCommand):
    help = "Applique un fichier d'activation AlgoPlanR signé par l'administration."

    def add_arguments(self, parser):
        parser.add_argument("fichier")

    def handle(self, *args, **o):
        try:
            contenu = Path(o["fichier"]).read_bytes()
        except OSError as exc:
            raise CommandError(f"Fichier illisible : {exc}")
        try:
            a = appliquer(contenu, auteur="ligne-de-commande")
        except RefusMetier as exc:
            raise CommandError(" ; ".join([exc.message, *exc.motifs]))
        self.stdout.write(f"Fichier « {a.type} » appliqué :")
        for ligne in a.resume.get("operations", []):
            self.stdout.write(f"  - {ligne}")
