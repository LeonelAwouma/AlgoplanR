import uuid

from django.db import models

from domaine.donnees.annee_scolaire import annee_scolaire_courante


class JeuDeDonnees(models.Model):
    """Agrégat racine : un import (établissements + enseignants). Sa suppression est en cascade.

    `portee` et `region` fixent qui peut le voir (contextes/acces/perimetre.py) : un jeu régional n'est ouvert
    qu'au délégué de sa région (et en lecture au DRH) ; un jeu national n'est ouvert qu'au DRH. Une portée vide
    (jeu non classé) ne donne accès à personne en écriture.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=200)
    source = models.CharField(max_length=20, default="import")  # import | demonstration | consolidation
    # Année scolaire des données importées (« 2024-2025 »), saisie à la création : c'est la base des projections
    # (N+1 est l'année suivante) et elle date les rapports.
    annee_scolaire = models.CharField(max_length=9, default=annee_scolaire_courante)
    cree_le = models.DateTimeField(auto_now_add=True)
    portee = models.CharField(max_length=20, blank=True, default="", db_index=True)  # regional | national | national_herite
    region = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    cree_par = models.ForeignKey("acces.Compte", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="jeux_crees")
    consolide_depuis = models.JSONField(default=list, blank=True)
    # Validation comme référence des projections (brouillon -> valide) ; une actualisation la retire.
    statut = models.CharField(max_length=10, default="brouillon")  # brouillon | valide
    valide_le = models.DateTimeField(null=True, blank=True)
    valide_par = models.CharField(max_length=150, blank=True, default="")
    # Validation « avec réserve DRH » : {motif, auteur, le, controles}. Vide pour une validation normale.
    validation_reserve = models.JSONField(null=True, blank=True, default=None)
    # Scénario dont les mouvements alimentent la planification et les nominations.
    scenario_retenu = models.ForeignKey("simulation.Scenario", null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name="+")

    class Meta:
        ordering = ["-cree_le"]


class Actualisation(models.Model):
    """Remplacement des données d'un jeu par deux nouveaux fichiers, avec les écarts constatés."""
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="actualisations")
    realisee_le = models.DateTimeField(auto_now_add=True)
    realisee_par = models.CharField(max_length=150, blank=True, default="")
    fichier_etablissements = models.CharField(max_length=255, blank=True, default="")
    fichier_enseignants = models.CharField(max_length=255, blank=True, default="")
    ecarts = models.JSONField(default=dict)   # arrivees, departs, changements_ecole, decisions_invalidees

    class Meta:
        ordering = ["-realisee_le", "-id"]


class FichierImporte(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=20)  # etablissements | enseignants
    nom_fichier = models.CharField(max_length=255)
    feuille = models.CharField(max_length=255, blank=True, default="")
    feuilles = models.JSONField(default=list)
    entetes = models.JSONField(default=list)
    apercu = models.JSONField(default=list)
    correspondance = models.JSONField(default=dict)
    a_confirmer = models.JSONField(default=list)
    lignes = models.JSONField(default=list)          # lignes brutes (clés = en-têtes sources)
    numeros_lignes = models.JSONField(default=list)  # numéro de chaque ligne dans le classeur (rapports d'erreurs)
    # Fichier de la base nationale (toutes régions) : un délégué n'en retient que les lignes de sa région.
    base_nationale = models.BooleanField(default=False)
    jeu =models.ForeignKey(JeuDeDonnees, null=True, blank=True, on_delete=models.CASCADE, related_name="fichiers")
    cree_par = models.ForeignKey("acces.Compte", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="fichiers_envoyes")
    cree_le = models.DateTimeField(auto_now_add=True)


class RapportQualite(models.Model):
    jeu = models.OneToOneField(JeuDeDonnees, on_delete=models.CASCADE, related_name="rapport_qualite")
    contenu = models.JSONField(default=dict)


class Etablissement(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="etablissements")
    id_ecole = models.CharField(max_length=100)
    sous_systeme = models.CharField(max_length=50, default="Francophone")
    region = models.CharField(max_length=100, blank=True, default="", db_index=True)
    departement = models.CharField(max_length=100, blank=True, default="", db_index=True)
    commune = models.CharField(max_length=100, blank=True, default="", db_index=True)
    iaeb = models.CharField(max_length=150, blank=True, default="")
    effectif_eleves = models.FloatField(default=0)
    enseignants_actuels = models.FloatField(default=0)
    salles_simple_flux = models.FloatField(default=0)
    salles_double_flux = models.FloatField(default=0)
    accessibilite = models.CharField(max_length=50, blank=True, default="")
    securite = models.CharField(max_length=50, blank=True, default="")
    multigrade = models.CharField(max_length=20, blank=True, default="")
    nom = models.CharField(max_length=255, blank=True, default="")
    type_etab = models.CharField(max_length=30, default="ECOLE")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    effectif_connu = models.BooleanField(default=True)
    salles_connues = models.BooleanField(default=True)
    #: Colonne Salles_Double_Flux renseignée dans le fichier ; vide pour les jeux importés avant ce suivi.
    salles_double_flux_connues = models.BooleanField(null=True, blank=True)
    classes_ouvertes = models.FloatField(null=True, blank=True)
    ordre = models.IntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["jeu", "id_ecole"], name="etab_unique_par_jeu")]
        ordering = ["jeu", "ordre"]


class Enseignant(models.Model):
    jeu = models.ForeignKey(JeuDeDonnees, on_delete=models.CASCADE, related_name="enseignants")
    matricule = models.CharField(max_length=100)
    nom = models.CharField(max_length=150, blank=True, default="")
    prenom = models.CharField(max_length=150, blank=True, default="")
    sous_systeme = models.CharField(max_length=50, blank=True, default="Francophone")
    ecole_attache = models.CharField(max_length=100, blank=True, default="", db_index=True)
    age = models.FloatField(null=True, blank=True)
    anciennete_carriere = models.FloatField(default=0)
    anciennete_poste = models.FloatField(default=0)
    annees_zone_1 = models.FloatField(default=0)
    annees_zone_2 = models.FloatField(default=0)
    situation = models.CharField(max_length=50, blank=True, default="")
    enfants = models.FloatField(default=0)
    formations = models.FloatField(default=0)
    voeu_1 = models.CharField(max_length=100, blank=True, default="")
    voeu_2 = models.CharField(max_length=100, blank=True, default="")
    voeu_3 = models.CharField(max_length=100, blank=True, default="")
    motif_bonification = models.CharField(max_length=255, blank=True, default="")
    age_connu = models.BooleanField(default=True)
    ordre = models.IntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["jeu", "matricule"], name="ens_unique_par_jeu")]
        ordering = ["jeu", "ordre"]
