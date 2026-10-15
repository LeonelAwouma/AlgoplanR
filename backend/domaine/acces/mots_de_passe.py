"""Règles d'un nouveau mot de passe. Python pur : la comparaison aux anciens mots de passe se fait hors du domaine.

Les mêmes règles sont affichées par l'interface (components/acces/domain/motDePasse.ts), mais seul ce contrôle,
exécuté par le serveur, fait foi.
"""
from __future__ import annotations

from typing import List

LONGUEUR_MIN = 10
LONGUEUR_MAX = 128
# Mots de passe triviaux refusés même s'ils respectent les autres règles.
TRIVIAUX = {"123456", "1234567890", "azerty1234", "motdepasse1", "password12", "algoplanr1", "cameroun2026"}


def erreurs_mot_de_passe(nouveau: str, identifiant: str = "") -> List[str]:
    """Raisons pour lesquelles `nouveau` est refusé ; liste vide s'il est acceptable."""
    erreurs = []
    if len(nouveau) < LONGUEUR_MIN:
        erreurs.append(f"Le mot de passe doit compter au moins {LONGUEUR_MIN} caractères.")
    if len(nouveau) > LONGUEUR_MAX:
        erreurs.append(f"Le mot de passe ne doit pas dépasser {LONGUEUR_MAX} caractères.")
    if not any(c.isalpha() for c in nouveau):
        erreurs.append("Le mot de passe doit contenir au moins une lettre.")
    if not any(c.isdigit() for c in nouveau):
        erreurs.append("Le mot de passe doit contenir au moins un chiffre.")
    if nouveau.strip() != nouveau:
        erreurs.append("Le mot de passe ne doit commencer ni finir par un espace.")
    ident = identifiant.strip().lower()
    if ident and (ident in nouveau.lower() or nouveau.lower() in ident):
        erreurs.append("Le mot de passe ne doit pas reprendre l'identifiant.")
    if nouveau.lower() in TRIVIAUX or len(set(nouveau)) < 4:
        erreurs.append("Ce mot de passe est trop facile à deviner.")
    return erreurs
