from django.db import models

from contextes.donnees.models import JeuDeDonnees


class DiagnosticCache(models.Model):
    """Diagnostic indexé par empreinte (jeu + faits de Prince + paramètres)."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="diagnostics")
    empreinte = models.CharField(max_length=64, db_index=True)
    contenu = models.JSONField(default=dict)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["jeu", "empreinte"], name="diag_unique_empreinte")]
