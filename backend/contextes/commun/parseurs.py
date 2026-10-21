"""Analyseurs de corps de requête."""
from __future__ import annotations

from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser


class JSONObjetParser(JSONParser):
    """JSON dont la racine est un objet : toutes les vues lisent leur corps avec `.get`, un tableau, un texte ou
    `null` en racine serait une erreur serveur. Il est refusé en 400 dès l'analyse."""

    def parse(self, stream, media_type=None, parser_context=None):
        donnees = super().parse(stream, media_type, parser_context)
        if not isinstance(donnees, dict):
            raise ParseError("Le corps de la requête doit être un objet JSON.")
        return donnees
