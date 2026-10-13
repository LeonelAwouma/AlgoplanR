from django.db import models

from contextes.donnees.models import JeuDeDonnees


class Scenario(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="scenarios")
    code = models.CharField(max_length=50, blank=True, default="")      # code du modèle (preset) ou vide
    nom = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True, default="")
    geographique = models.BooleanField(default=False)
    parametres = models.JSONField(default=dict)                          # surcharges figées du scénario
    obsolete = models.BooleanField(default=False)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class ResultatSimulation(models.Model):
    scenario = models.OneToOneField(Scenario, on_delete=models.CASCADE, related_name="resultat")
    donnees = models.BinaryField()                  # JSON compressé (zlib)
    config = models.JSONField(default=dict)         # configuration effective utilisée
    empreinte = models.CharField(max_length=64)
    calcule_le = models.DateTimeField(auto_now=True)
