from django.db import models

from contextes.donnees.models import JeuDeDonnees


class Recrue(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="recrues")
    id_recrue = models.CharField(max_length=100)
    nom = models.CharField(max_length=150, blank=True, default="")
    prenom = models.CharField(max_length=150, blank=True, default="")
    sous_systeme = models.CharField(max_length=50, blank=True, default="")
    region_souhaitee = models.CharField(max_length=100, blank=True, default="")
    rang = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["jeu", "id_recrue"], name="recrue_unique_par_jeu")]
