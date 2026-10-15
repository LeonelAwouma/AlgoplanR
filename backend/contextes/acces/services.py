"""Cas d'usage du contexte Accès : connexion, sessions, mot de passe, région, administration par le DRH."""
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional, Tuple

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction

from contextes.commun.erreurs import RefusMetier
from domaine.acces.mots_de_passe import erreurs_mot_de_passe
from domaine.acces.regions import region_canonique

from . import horloge
from .activation import ETAT_INVALIDE, etat_registre
from .journal import duree_inactivite, empreinte
from .journal import evenement as _evenement
from .models import (ETAT_ACTIF, ETAT_REVOQUE, ETAT_SUSPENDU, PORTEE_CHANGEMENT_MDP, PORTEE_COMPLETE,
                     PORTEE_CONFIRMATION_REGION, Compte, EvenementAcces, SessionUtilisateur)

MESSAGE_ECHEC = "Identifiant ou mot de passe incorrect."
NB_ANCIENS_MDP = 3

_EMPREINTE_FACTICE: Optional[str] = None


class AccesRefuse(RefusMetier):
    """Refus d'accès : renvoyé avec le statut indiqué (401 ou 403) par la vue."""

    def __init__(self, message: str, code: str, statut: int = 401, motifs=None):
        super().__init__(message, motifs, code)
        self.statut = statut  # remplace le 422 des refus métier


def _reglage(nom: str, defaut):
    return getattr(settings, nom, defaut)


def _empreinte_factice() -> str:
    """Empreinte calculée pour un identifiant inconnu : le temps de réponse ne trahit pas l'existence du compte."""
    global _EMPREINTE_FACTICE
    if _EMPREINTE_FACTICE is None:
        _EMPREINTE_FACTICE = make_password(secrets.token_urlsafe(16))
    return _EMPREINTE_FACTICE


def portee_suivante(compte: Compte) -> str:
    if compte.mdp_temporaire:
        return PORTEE_CHANGEMENT_MDP
    if compte.est_delegue and compte.region_confirmee_le is None:
        return PORTEE_CONFIRMATION_REGION
    return PORTEE_COMPLETE


def ouvrir_session(compte: Compte, portee: Optional[str] = None) -> Tuple[str, SessionUtilisateur]:
    """Ouvre une session et renvoie le jeton en clair (transmis une seule fois) ; ferme les précédentes."""
    maintenant = horloge.maintenant()
    fermer_sessions(compte, "nouvelle_session")
    jeton = secrets.token_urlsafe(32)
    session = SessionUtilisateur.objects.create(
        compte=compte, empreinte_jeton=empreinte(jeton), portee=portee or portee_suivante(compte),
        cree_le=maintenant, derniere_activite=maintenant,
        expire_absolue=maintenant + timedelta(hours=_reglage("ACCES_DUREE_MAX_SESSION_H", 12)))
    return jeton, session


def fermer_sessions(compte: Compte, motif: str) -> int:
    return compte.sessions.filter(fermee_le__isnull=True).update(fermee_le=horloge.maintenant(),
                                                                  motif_fermeture=motif)


def echeances(session: SessionUtilisateur) -> dict:
    """Échéances de la session, en heure du serveur : l'interface en déduit son compte à rebours."""
    inactivite = session.derniere_activite + duree_inactivite()
    return {"portee": session.portee, "maintenant": horloge.maintenant(),
            "expire_inactivite_le": min(inactivite, session.expire_absolue),
            "expire_absolue_le": session.expire_absolue,
            "inactivite_minutes": int(duree_inactivite().total_seconds() // 60),
            "avertissement_minutes": _reglage("ACCES_AVERTISSEMENT_MIN", 2)}


def compte_dict(c: Compte) -> dict:
    return {"identifiant": c.identifiant, "nom": c.nom_affiche or c.identifiant, "role": c.role, "region": c.region,
            "etat": c.etat, "doit_changer_mot_de_passe": c.mdp_temporaire,
            "region_a_confirmer": c.est_delegue and c.region_confirmee_le is None,
            "region_confirmee_le": c.region_confirmee_le, "derniere_connexion": c.derniere_connexion}


def reponse_session(c: Compte, jeton: Optional[str], session: SessionUtilisateur) -> dict:
    corps = {"compte": compte_dict(c), "session": echeances(session)}
    if jeton:
        corps["jeton"] = jeton
    return corps


# --- Connexion --------------------------------------------------------------------------------------------------


def connecter(identifiant: str, mot_de_passe: str) -> Tuple[Compte, str, SessionUtilisateur]:
    # Pas de transaction englobante : un refus doit laisser sa trace (compteur d'échecs, blocage, historique).
    if etat_registre() == ETAT_INVALIDE:
        raise AccesRefuse("Le registre des accès de ce poste est incohérent. Contactez l'administration AlgoPlanR.",
                          "registre_invalide", 503)
    identifiant = (identifiant or "").strip().lower()
    maintenant = horloge.maintenant()
    compte = Compte.objects.filter(identifiant=identifiant).first()
    if compte is None:
        check_password(mot_de_passe or "", _empreinte_factice())
        _evenement(None, EvenementAcces.ECHEC, details={"raison": "identifiant_inconnu"}, identifiant=identifiant[:60])
        raise AccesRefuse(MESSAGE_ECHEC, "identifiants_invalides")
    if compte.bloque_jusqu_au and compte.bloque_jusqu_au > maintenant:
        minutes = max(1, int((compte.bloque_jusqu_au - maintenant).total_seconds() // 60) + 1)
        _evenement(compte, EvenementAcces.ECHEC, details={"raison": "compte_bloque"})
        raise AccesRefuse(f"Trop d'essais infructueux. Réessayez dans {minutes} minute(s).", "compte_bloque")
    if not check_password(mot_de_passe or "", compte.mot_de_passe):
        compte.echecs_consecutifs += 1
        details = {"raison": "mot_de_passe", "echecs": compte.echecs_consecutifs}
        if compte.echecs_consecutifs >= _reglage("ACCES_ESSAIS_AVANT_BLOCAGE", 5):
            compte.bloque_jusqu_au = maintenant + timedelta(minutes=_reglage("ACCES_DUREE_BLOCAGE_MIN", 15))
            compte.echecs_consecutifs = 0
            _evenement(compte, EvenementAcces.BLOCAGE, details={"jusqu_au": compte.bloque_jusqu_au.isoformat()})
        compte.save(update_fields=["echecs_consecutifs", "bloque_jusqu_au"])
        _evenement(compte, EvenementAcces.ECHEC, details=details)
        raise AccesRefuse(MESSAGE_ECHEC, "identifiants_invalides")
    # Mot de passe exact : l'état du compte n'est révélé qu'à qui connaît le mot de passe.
    if compte.etat == ETAT_REVOQUE:
        _evenement(compte, EvenementAcces.ECHEC, details={"raison": "revoque"})
        raise AccesRefuse("Ce compte a été révoqué. Contactez l'administration AlgoPlanR.", "compte_revoque", 403)
    if compte.etat == ETAT_SUSPENDU:
        _evenement(compte, EvenementAcces.ECHEC, details={"raison": "suspendu"})
        raise AccesRefuse("Ce compte est suspendu. Contactez le DRH.", "compte_suspendu", 403)
    # Aucun mot de passe n'expire, temporaire ou personnel : seule la session a des délais.
    compte.echecs_consecutifs, compte.bloque_jusqu_au, compte.derniere_connexion = 0, None, maintenant
    compte.save(update_fields=["echecs_consecutifs", "bloque_jusqu_au", "derniere_connexion"])
    jeton, session = ouvrir_session(compte)
    _evenement(compte, EvenementAcces.CONNEXION, details={"portee": session.portee})
    return compte, jeton, session


def deconnecter(session: SessionUtilisateur) -> None:
    if session.fermee_le is None:
        session.fermee_le, session.motif_fermeture = horloge.maintenant(), "deconnexion"
        session.save(update_fields=["fermee_le", "motif_fermeture"])
        _evenement(session.compte, EvenementAcces.DECONNEXION)


# --- Mot de passe et région -------------------------------------------------------------------------------------


@transaction.atomic
def changer_mot_de_passe(compte: Compte, actuel: str, nouveau: str, confirmation: str
                         ) -> Tuple[str, SessionUtilisateur]:
    """Nouveau mot de passe, en une seule transaction avec ses effets : consommation définitive du code d'accès en
    attente (délégué) et réenveloppement du carnet chiffré (DRH). Au moindre refus, rien n'est enregistré."""
    from .codes_acces import consommer_en_attente

    compte = Compte.objects.select_for_update().get(pk=compte.pk)
    if not check_password(actuel or "", compte.mot_de_passe):
        raise RefusMetier("Mot de passe actuel incorrect", code="mot_de_passe_actuel_incorrect")
    erreurs = []
    if nouveau != confirmation:
        erreurs.append("Les deux saisies du nouveau mot de passe ne sont pas identiques.")
    erreurs += erreurs_mot_de_passe(nouveau or "", compte.identifiant)
    # `actuel` vient d'être vérifié : la comparaison directe évite un hachage de plus (PBKDF2, ~1 s par calcul).
    if nouveau == actuel:
        erreurs.append("Le nouveau mot de passe doit être différent de l'actuel (ou du mot de passe temporaire).")
    if any(check_password(nouveau or "", ancien) for ancien in compte.anciens_mdp):
        erreurs.append(f"Le nouveau mot de passe ne doit reprendre aucun des {NB_ANCIENS_MDP} précédents.")
    if erreurs:
        raise RefusMetier("Nouveau mot de passe refusé", erreurs, code="mot_de_passe_refuse")
    consommer_en_attente(compte)          # 409 si le code a déjà été consommé : tout est annulé
    cle_secours = None
    if compte.est_drh:
        # Carnet apporté par le fichier d'activation : installé ici ; sinon, clé simplement réenveloppée.
        from .coffre import installer_en_attente
        cle_secours = installer_en_attente(compte, actuel, nouveau)
    # Un mot de passe temporaire n'est jamais gardé dans l'historique : il ne pourra plus servir de toute façon.
    if not compte.mdp_temporaire:
        compte.anciens_mdp = ([compte.mot_de_passe] + list(compte.anciens_mdp))[:NB_ANCIENS_MDP]
    compte.mot_de_passe = make_password(nouveau)
    compte.mdp_temporaire, compte.mdp_temporaire_expire_le = False, None
    compte.mdp_change_le = horloge.maintenant()
    compte.save(update_fields=["mot_de_passe", "mdp_temporaire", "mdp_temporaire_expire_le", "mdp_change_le",
                               "anciens_mdp"])
    fermer_sessions(compte, "changement_mot_de_passe")
    _evenement(compte, EvenementAcces.CHANGEMENT_MDP)
    jeton, session = ouvrir_session(compte)
    session.cle_secours = cle_secours      # montrée une seule fois, jamais enregistrée en clair
    return jeton, session


def confirmer_region(compte: Compte, region: str) -> Tuple[str, SessionUtilisateur]:
    # Pas de transaction englobante : un refus de région doit rester dans l'historique.
    if not compte.est_delegue:
        raise AccesRefuse("Seul un délégué régional confirme une région.", "role_invalide", 403)
    if compte.region_confirmee_le is not None:
        raise AccesRefuse("La région de ce compte est déjà confirmée et verrouillée.", "region_deja_confirmee", 409)
    if region_canonique(region) != compte.region:
        _evenement(compte, EvenementAcces.REFUS_REGION, details={"demandee": str(region)[:40]})
        raise AccesRefuse(
            "Cette région n'est pas celle attribuée à votre compte. Une réaffectation passe par l'administration.",
            "region_non_autorisee", 403)
    compte.region_confirmee_le = horloge.maintenant()
    compte.save(update_fields=["region_confirmee_le"])
    _evenement(compte, EvenementAcces.CONFIRMATION_REGION, details={"region": compte.region})
    return ouvrir_session(compte)


# --- Administration par le DRH ----------------------------------------------------------------------------------


def delegue_administrable(drh: Compte, identifiant: str) -> Compte:
    """Compte de délégué sur lequel le DRH peut agir ; jamais un DRH, jamais lui-même."""
    from django.http import Http404

    c = Compte.objects.filter(identifiant=identifiant).first()
    if c is None:
        raise Http404("Compte introuvable")
    if not c.est_delegue or c.pk == drh.pk:
        raise AccesRefuse("Le DRH n'administre que les comptes des délégués régionaux.", "compte_non_administrable",
                          403)
    return c


def suspendre(drh: Compte, c: Compte) -> Compte:
    if c.etat == ETAT_REVOQUE:
        raise RefusMetier("Un compte révoqué ne peut être modifié que par l'administration", code="compte_revoque")
    c.etat = ETAT_SUSPENDU
    c.save(update_fields=["etat"])
    fermer_sessions(c, "suspension")
    _evenement(c, EvenementAcces.SUSPENSION, auteur=drh.identifiant)
    return c


def reactiver(drh: Compte, c: Compte) -> Compte:
    if c.etat == ETAT_REVOQUE:
        raise RefusMetier("Un compte révoqué ne peut être réactivé que par un fichier d'activation de l'administration",
                          code="compte_revoque")
    c.etat = ETAT_ACTIF
    c.echecs_consecutifs, c.bloque_jusqu_au = 0, None
    c.save(update_fields=["etat", "echecs_consecutifs", "bloque_jusqu_au"])
    _evenement(c, EvenementAcces.REACTIVATION, auteur=drh.identifiant)
    return c


def reinitialiser_mot_de_passe(drh: Compte, c: Compte) -> str:
    """Pose un mot de passe temporaire tiré au hasard ; il n'est renvoyé qu'une fois, pour être transmis."""
    if c.etat == ETAT_REVOQUE:
        raise RefusMetier("Un compte révoqué ne peut être modifié que par l'administration", code="compte_revoque")
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    temporaire = "".join(secrets.choice(alphabet) for _ in range(12))
    c.mot_de_passe = make_password(temporaire)
    c.mdp_temporaire = True
    c.mdp_temporaire_expire_le = None     # aucun mot de passe n'expire
    c.echecs_consecutifs, c.bloque_jusqu_au = 0, None
    c.save(update_fields=["mot_de_passe", "mdp_temporaire", "mdp_temporaire_expire_le", "echecs_consecutifs",
                          "bloque_jusqu_au"])
    fermer_sessions(c, "reinitialisation")
    _evenement(c, EvenementAcces.REINITIALISATION, auteur=drh.identifiant)
    return temporaire


def fermer_sessions_de(drh: Compte, c: Compte) -> int:
    n = fermer_sessions(c, "fermeture_par_drh")
    _evenement(c, EvenementAcces.FERMETURE_SESSIONS, auteur=drh.identifiant, details={"sessions": n})
    return n


def evenement_dict(e: EvenementAcces) -> dict:
    return {"type": e.type, "le": e.le, "auteur": e.auteur, "details": e.details}
