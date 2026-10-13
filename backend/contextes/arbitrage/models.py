from django.db import models

from contextes.donnees.models import JeuDeDonnees


class DecisionArbitrage(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="arbitrages")
    id_ens = models.CharField(max_length=100)
    id_etab = models.CharField(max_length=100)
    motif = models.CharField(max_length=500, blank=True, default="")
    commission = models.CharField(max_length=150, blank=True, default="")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["jeu", "id_ens"], name="arbitrage_unique_par_ens")]
