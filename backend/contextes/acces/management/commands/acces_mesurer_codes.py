"""Mesure le coût de vérification des codes des délégués (aucune donnée n'est enregistrée).

    python manage.py acces_mesurer_codes                 # 100, 500 et 1 000 codes, paramètres du catalogue
    python manage.py acces_mesurer_codes --tailles 50 200 --n 32768

Compare la vérification groupée (un sel par région et usage : un seul calcul scrypt par saisie) à la variante
« un sel par code » (un calcul par code du groupe), estimée sur 5 calculs. Donne aussi le coût d'une attaque hors
ligne sur un catalogue extrait de l'installation.
"""
from __future__ import annotations

import os
import time

from django.core.management.base import BaseCommand

from domaine.acces import codes as dom


class Command(BaseCommand):
    help = "Mesure la vérification scrypt des codes d'accès selon la taille du catalogue."

    def add_arguments(self, parser):
        parser.add_argument("--tailles", type=int, nargs="+", default=[100, 500, 1000])
        parser.add_argument("--n", type=int, default=dom.PARAMS_CATALOGUE["n"])
        parser.add_argument("--coeurs", type=int, default=16, help="Cœurs supposés pour l'attaque hors ligne")

    def handle(self, *args, **o):
        params = {**dom.PARAMS_CATALOGUE, "n": o["n"]}
        memoire = 128 * params["r"] * params["n"] * params["p"] / 2 ** 20
        self.stdout.write(f"scrypt n={params['n']} r={params['r']} p={params['p']} : {memoire:.0f} Mo par calcul")

        debut = time.perf_counter()
        for _ in range(3):
            dom.verificateur("ABCDEFGH", os.urandom(16), params)
        unitaire = (time.perf_counter() - debut) / 3
        self.stdout.write(f"Un calcul : {unitaire * 1000:.0f} ms")

        for taille in o["tailles"]:
            # Groupe complet : le dernier vérificateur est réel, les autres aléatoires (même taille, même
            # parcours) — la saisie coûte un calcul et N comparaisons ; la génération est extrapolée (N calculs).
            codes = dom.generer_codes(taille)
            sel = os.urandom(16)
            g = {"region": "Centre", "usage": "activation", "sel": dom.b64(sel),
                 "verificateurs": [{"id": f"E{i}", "v": dom.b64(os.urandom(32))} for i in range(taille - 1)]
                 + [{"id": f"E{taille - 1}", "v": dom.b64(dom.verificateur(codes[-1], sel, params))}]}
            debut = time.perf_counter()
            assert dom.chercher(codes[-1], g, params) == f"E{taille - 1}"
            assert dom.chercher("ZZZZZZZZ" if "ZZZZZZZZ" not in codes else "YYYYYYYY", g, params) is None
            saisie = (time.perf_counter() - debut) / 2
            self.stdout.write(
                f"{taille:>5} codes : saisie groupée {saisie * 1000:6.0f} ms | un sel par code env. "
                f"{unitaire * taille:7.1f} s | génération du catalogue env. {unitaire * taille / 60:5.1f} min")

        espace = len(dom.ALPHABET) ** dom.LONGUEUR
        for n_codes in (10, 50, 200):
            essais = espace / (2 * n_codes)
            annees = essais * unitaire / o["coeurs"] / (365.25 * 86400)
            self.stdout.write(f"Attaque hors ligne, {n_codes:>3} codes par groupe, {o['coeurs']} cœurs : "
                              f"env. {annees:,.1f} an(s) en moyenne pour trouver un code".replace(",", " "))
