"""Registre des comptes, sessions et historique des accès.

Aucun secret n'est conservé en clair : les mots de passe sont des empreintes Django (PBKDF2), les jetons de session
des empreintes SHA-256. Les comptes ne sont créés que par un fichier d'activation signé (voir activation.py).
"""
import uuid

from django.db import models
from django.db.models import Q

ROLE_DRH = "DRH"
ROLE_DELEGUE = "DELEGUE"
ROLES = [(ROLE_DRH, "DRH national"), (ROLE_DELEGUE, "Délégué régional")]

ETAT_ACTIF = "ACTIF"
ETAT_SUSPENDU = "SUSPENDU"
ETAT_REVOQUE = "REVOQUE"
ETATS = [(ETAT_ACTIF, "Actif"), (ETAT_SUSPENDU, "Suspendu"), (ETAT_REVOQUE, "Révoqué")]

PORTEE_CHANGEMENT_MDP = "CHANGEMENT_MDP"
PORTEE_CONFIRMATION_REGION = "CONFIRMATION_REGION"
PORTEE_COMPLETE = "COMPLETE"
PORTEES = [(PORTEE_CHANGEMENT_MDP, "Changement du mot de passe"),
           (PORTEE_CONFIRMATION_REGION, "Confirmation de la région"), (PORTEE_COMPLETE, "Complète")]


class ActivationAppliquee(models.Model):
    """Fichier d'activation signé déjà appliqué : un même fichier ne peut pas être rejoué."""
    id = models.UUIDField(primary_key=True)
    type = models.CharField(max_length=30)
    emise_le = models.DateTimeField()
    appliquee_le = models.DateTimeField(auto_now_add=True)
    empreinte_fichier = models.CharField(max_length=64)
    resume = models.JSONField(default=dict)

    class Meta:
        ordering = ["appliquee_le"]


class Compte(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    identifiant = models.CharField(max_length=60, unique=True)
    nom_affiche = models.CharField(max_length=150, blank=True, default="")
    role = models.CharField(max_length=10, choices=ROLES)
    region = models.CharField(max_length=30, null=True, blank=True)
    etat = models.CharField(max_length=10, choices=ETATS, default=ETAT_ACTIF)
    mot_de_passe = models.CharField(max_length=256)
    mdp_temporaire = models.BooleanField(default=True)
    mdp_temporaire_expire_le = models.DateTimeField(null=True, blank=True)
    mdp_change_le = models.DateTimeField(null=True, blank=True)
    anciens_mdp = models.JSONField(default=list)
    region_confirmee_le = models.DateTimeField(null=True, blank=True)
    echecs_consecutifs = models.PositiveIntegerField(default=0)
    bloque_jusqu_au = models.DateTimeField(null=True, blank=True)
    derniere_connexion = models.DateTimeField(null=True, blank=True)
    cree_le = models.DateTimeField(auto_now_add=True)
    cree_par_activation = models.ForeignKey(ActivationAppliquee, null=True, blank=True, on_delete=models.PROTECT,
                                            related_name="comptes")

    class Meta:
        ordering = ["role", "region", "identifiant"]
        constraints = [
            # Un délégué a toujours une région ; le DRH n'en a jamais : il ne peut pas être réduit à une région,
            # et un délégué ne peut pas être élargi au national.
            models.CheckConstraint(
                condition=(Q(role=ROLE_DRH, region__isnull=True) | Q(role=ROLE_DELEGUE, region__isnull=False)),
                name="compte_region_selon_role"),
        ]

    # Intégration DRF : request.user est un Compte.
    is_authenticated = True
    is_anonymous = False

    @property
    def est_drh(self) -> bool:
        return self.role == ROLE_DRH

    @property
    def est_delegue(self) -> bool:
        return self.role == ROLE_DELEGUE

    @property
    def actif(self) -> bool:
        return self.etat == ETAT_ACTIF

    def __str__(self) -> str:
        return self.identifiant


class SessionUtilisateur(models.Model):
    compte = models.ForeignKey(Compte, on_delete=models.CASCADE, related_name="sessions")
    empreinte_jeton = models.CharField(max_length=64, unique=True)
    portee = models.CharField(max_length=20, choices=PORTEES)
    cree_le = models.DateTimeField()
    derniere_activite = models.DateTimeField()
    expire_absolue = models.DateTimeField()
    fermee_le = models.DateTimeField(null=True, blank=True)
    motif_fermeture = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        ordering = ["-cree_le"]
        indexes = [models.Index(fields=["compte", "fermee_le"])]


class EvenementAcces(models.Model):
    """Historique minimal des accès : qui, quoi, quand. Jamais de mot de passe ni de jeton."""
    CONNEXION = "CONNEXION"
    ECHEC = "ECHEC_CONNEXION"
    BLOCAGE = "BLOCAGE"
    DECONNEXION = "DECONNEXION"
    EXPIRATION = "EXPIRATION"
    CHANGEMENT_MDP = "CHANGEMENT_MDP"
    CONFIRMATION_REGION = "CONFIRMATION_REGION"
    REFUS_REGION = "REFUS_REGION"
    SUSPENSION = "SUSPENSION"
    REACTIVATION = "REACTIVATION"
    REVOCATION = "REVOCATION"
    REINITIALISATION = "REINITIALISATION"
    ACTIVATION = "ACTIVATION"
    REAFFECTATION = "REAFFECTATION"
    FERMETURE_SESSIONS = "FERMETURE_SESSIONS"
    # Codes d'accès des délégués et carnet du DRH (jamais le code lui-même dans `details`).
    ECHEC_CODE = "ECHEC_CODE"
    CODE_ACCEPTE = "CODE_ACCEPTE"
    CODE_CONSOMME = "CODE_CONSOMME"
    CODE_REMIS = "CODE_REMIS"
    CATALOGUE_IMPORTE = "CATALOGUE_IMPORTE"
    CARNET_IMPORTE = "CARNET_IMPORTE"
    CARNET_VERROUILLE = "CARNET_VERROUILLE"
    CARNET_DEBLOQUE = "CARNET_DEBLOQUE"

    compte = models.ForeignKey(Compte, null=True, blank=True, on_delete=models.SET_NULL, related_name="evenements")
    identifiant_saisi = models.CharField(max_length=60, blank=True, default="")
    type = models.CharField(max_length=30)
    le = models.DateTimeField()
    auteur = models.CharField(max_length=60, blank=True, default="")
    details = models.JSONField(default=dict)

    class Meta:
        ordering = ["-le"]
        indexes = [models.Index(fields=["compte", "-le"])]


# --- Postes autonomes : identifiant du poste, codes des délégués, carnet du DRH ---------------------------------


class Poste(models.Model):
    """Identifiant administratif du poste, tiré au premier démarrage. Copié avec la base : ce n'est pas une
    protection contre le clonage, seulement un repère pour lier un fichier signé à un poste."""
    identifiant = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    cree_le = models.DateTimeField(auto_now_add=True)


class CatalogueCodes(models.Model):
    """Catalogue signé de vérificateurs importé sur le poste (le catalogue embarqué n'est pas copié ici)."""
    numero = models.PositiveIntegerField(unique=True)
    contenu = models.BinaryField()          # fichier signé tel que reçu, revérifié à chaque lecture
    importe_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["numero"]


class CodeConsomme(models.Model):
    """Code d'activation ou de récupération définitivement utilisé sur ce poste (identifiant d'entrée du
    catalogue, jamais le code)."""
    entree = models.CharField(max_length=40, unique=True)
    region = models.CharField(max_length=30)
    usage = models.CharField(max_length=15)
    compte = models.ForeignKey(Compte, null=True, on_delete=models.SET_NULL, related_name="codes_consommes")
    consomme_le = models.DateTimeField()


class CodeEnAttente(models.Model):
    """Code accepté dont le mot de passe personnel n'est pas encore créé : il sera consommé à ce moment-là."""
    compte = models.OneToOneField(Compte, on_delete=models.CASCADE, related_name="code_en_attente")
    entree = models.CharField(max_length=40)
    usage = models.CharField(max_length=15)
    cree_le = models.DateTimeField()


class CoffreCarnet(models.Model):
    """Carnet des codes du DRH, chiffré (AES-256-GCM) par une clé de données enveloppée par le mot de passe du DRH
    et par une clé de secours. `index` ne contient que les identifiants non secrets (id, région, usage)."""
    carnet = models.JSONField(default=dict)          # {nonce, chiffre}
    cle_mot_de_passe = models.JSONField(default=dict)
    cle_secours = models.JSONField(default=dict)
    index = models.JSONField(default=list)
    numeros = models.JSONField(default=list)         # numéros des carnets importés
    verrouille = models.BooleanField(default=False)  # mot de passe réinitialisé : clé de secours requise
    maj_le = models.DateTimeField(auto_now=True)


class RemiseCode(models.Model):
    """Code du carnet remis par le DRH à un délégué (sans le code)."""
    entree = models.CharField(max_length=40, unique=True)
    region = models.CharField(max_length=30)
    usage = models.CharField(max_length=15)
    remis_le = models.DateTimeField()
    remis_a = models.CharField(max_length=150, blank=True, default="")
    remis_par = models.CharField(max_length=60, blank=True, default="")

    class Meta:
        ordering = ["-remis_le"]


class CleCarnetEnAttente(models.Model):
    """Clé du carnet embarqué, apportée par le fichier d'activation (ou de récupération) du DRH, enveloppée par son
    mot de passe temporaire. Elle est consommée à la création du mot de passe personnel, qui installe le carnet."""
    compte = models.OneToOneField(Compte, on_delete=models.CASCADE, related_name="cle_carnet_en_attente")
    enveloppe = models.JSONField(default=dict)
    cree_le = models.DateTimeField(auto_now_add=True)
