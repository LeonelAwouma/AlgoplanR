from django.db import models

from contextes.donnees.models import JeuDeDonnees


class EvenementAudit(models.Model):
    """Décision ou recalcul d'un jeu (journal d'audit de codeSource, AuditService, étendu à toutes les écritures)."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="evenements_audit")
    type = models.CharField(max_length=30, db_index=True)
    action = models.CharField(max_length=100)
    objet_type = models.CharField(max_length=50, blank=True, default="")
    objet_id = models.CharField(max_length=200, blank=True, default="")
    resume = models.CharField(max_length=500)
    auteur = models.CharField(max_length=150, blank=True, default="")
    compte = models.CharField(max_length=60, blank=True, default="")   # identifiant du compte connecté
    le = models.DateTimeField(auto_now_add=True, db_index=True)
    avant = models.JSONField(null=True, blank=True)
    apres = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-le", "-id"]
