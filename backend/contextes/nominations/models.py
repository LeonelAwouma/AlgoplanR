from django.db import models

from contextes.donnees.models import JeuDeDonnees


class PersonneVivier(models.Model):
    """Personne ajoutée au vivier depuis une autre source que le moteur (disponibilité, réintégration…)."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="personnes_vivier")
    ident = models.CharField(max_length=150)
    matricule = models.CharField(max_length=100, null=True, blank=True)
    nom = models.CharField(max_length=150, blank=True, default="")
    prenom = models.CharField(max_length=150, blank=True, default="")
    source = models.CharField(max_length=30)
    sous_systeme = models.CharField(max_length=50, blank=True, default="")
    region = models.CharField(max_length=100, blank=True, default="")
    departement = models.CharField(max_length=100, blank=True, default="")
    commune = models.CharField(max_length=100, blank=True, default="")
    note = models.FloatField(null=True, blank=True)
    ajoutee_par = models.CharField(max_length=150, blank=True, default="")
    ajoutee_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["jeu", "ident"], name="personne_vivier_unique")]


class Nomination(models.Model):
    """Nomination d'une personne du vivier sur un poste ouvert (cycle de vie de codeSource, NominationService)."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="nominations")
    personne_id = models.CharField(max_length=150, db_index=True)
    matricule = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    personne = models.JSONField(default=dict)    # instantané de la personne à la création
    poste_id = models.CharField(max_length=200, db_index=True)
    poste = models.JSONField(default=dict)       # instantané du poste à la création
    annee = models.CharField(max_length=4, default="N+1")
    statut = models.CharField(max_length=20, default="proposee", db_index=True)
    origine = models.CharField(max_length=20, default="manuelle")   # automatique | manuelle | import
    motif = models.CharField(max_length=500, null=True, blank=True)
    reference_decision = models.CharField(max_length=200, null=True, blank=True)
    reference_acte = models.CharField(max_length=200, null=True, blank=True)
    date_effet = models.CharField(max_length=40, null=True, blank=True)
    creee_le = models.DateTimeField(auto_now_add=True)
    historique = models.JSONField(default=list)  # transitions {de, vers, le, auteur, motif, reference}

    class Meta:
        ordering = ["-creee_le", "-id"]


class RealisationMouvement(models.Model):
    """Mise en œuvre d'un mouvement du registre qui ne vient pas d'une nomination (redéploiement, recrue…)."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="realisations_mouvements")
    mouvement = models.CharField(max_length=200)
    date_effet = models.CharField(max_length=40, blank=True, default="")
    reference_acte = models.CharField(max_length=200, blank=True, default="")
    auteur = models.CharField(max_length=150, blank=True, default="")
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["jeu", "mouvement"], name="realisation_unique")]
