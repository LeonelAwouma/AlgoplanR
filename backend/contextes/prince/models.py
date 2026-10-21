from django.db import models

from contextes.donnees.models import JeuDeDonnees


class FaitPrince(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="faits_prince")
    id_ens = models.CharField(max_length=100)
    id_etab = models.CharField(max_length=100)
    motif = models.CharField(max_length=500, blank=True, default="")
    statut = models.CharField(max_length=20, default="ACTIF")   # ACTIF | ANNULE | INVALIDE
    # INVALIDE : devenu impossible après une actualisation des données ; jamais appliqué, motif conservé.
    motif_invalidite = models.CharField(max_length=500, blank=True, default="")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
