from django.db import models

from contextes.donnees.models import JeuDeDonnees


class Parametres(models.Model):
    """Surcharges des règles du moteur pour un jeu (EngineSettings, JSON)."""
    jeu = models.OneToOneField(JeuDeDonnees, on_delete=models.CASCADE, related_name="parametres")
    regles = models.JSONField(default=dict)
    mis_a_jour_le = models.DateTimeField(auto_now=True)
