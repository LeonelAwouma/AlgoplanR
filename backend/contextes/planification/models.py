from django.db import models

from contextes.donnees.models import JeuDeDonnees


class HypothesesJeu(models.Model):
    """Version des hypothèses d'un jeu ; la plus récente est en vigueur."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="hypotheses")
    version = models.PositiveIntegerField()
    contenu = models.JSONField(default=dict)
    modifiees_le = models.DateTimeField(auto_now_add=True)
    modifiees_par = models.CharField(max_length=150, blank=True, default="")
    motif = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["jeu", "version"], name="hypotheses_version_unique")]


class EtatPlanification(models.Model):
    jeu = models.OneToOneField(JeuDeDonnees, on_delete=models.CASCADE, related_name="etat_planification")
    version = models.PositiveIntegerField(default=1)
    calcule_le = models.DateTimeField(null=True, blank=True)
    declencheur = models.CharField(max_length=200, blank=True, default="")
    auteur = models.CharField(max_length=150, blank=True, default="")
    obsolete = models.BooleanField(default=False)
    # Empreinte des calculs qui ont produit les quotas « calculés » enregistrés.
    empreinte_quotas = models.CharField(max_length=64, blank=True, default="")


class VersionPlanification(models.Model):
    """Instantané conservé à chaque recalcul : tableaux et indicateurs du national et de chaque région."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="versions_planification")
    version = models.PositiveIntegerField()
    calcule_le = models.DateTimeField(auto_now_add=True)
    declencheur = models.CharField(max_length=200, blank=True, default="")
    auteur = models.CharField(max_length=150, blank=True, default="")
    tableaux = models.JSONField(default=dict)      # {"national": tableau, "regions": {region: tableau}}
    indicateurs = models.JSONField(default=dict)   # mêmes clés, indicateurs de suivi

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["jeu", "version"], name="planification_version_unique")]


class Quota(models.Model):
    """Quota de recrutement d'une région, d'un sous-système et d'une année : calculé, ajusté puis validé."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="quotas")
    annee = models.CharField(max_length=4)
    code_territoire = models.CharField(max_length=200)
    territoire = models.CharField(max_length=200)
    sous_systeme = models.CharField(max_length=20)
    calcule = models.IntegerField(default=0)
    retenu = models.IntegerField(default=0)
    motif_ajustement = models.CharField(max_length=500, null=True, blank=True)
    statut = models.CharField(max_length=10, default="calcule")   # calcule | ajuste | valide
    ajuste_par = models.CharField(max_length=150, null=True, blank=True)
    valide_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["annee", "territoire", "sous_systeme"]
        constraints = [models.UniqueConstraint(fields=["jeu", "annee", "code_territoire", "sous_systeme"],
                                               name="quota_unique")]


class EvenementQuota(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="evenements_quotas")
    annee = models.CharField(max_length=4)
    code_territoire = models.CharField(max_length=200)
    sous_systeme = models.CharField(max_length=20)
    evenement = models.CharField(max_length=12)   # calcul | ajustement | validation
    valeur = models.IntegerField(default=0)
    motif = models.CharField(max_length=500, null=True, blank=True)
    auteur = models.CharField(max_length=150, null=True, blank=True)
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-le", "-id"]
