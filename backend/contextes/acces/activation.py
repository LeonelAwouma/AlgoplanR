"""Fichiers d'activation signés : seul moyen de créer des comptes, de changer une région ou de révoquer un accès.

Un fichier est préparé hors du poste, par l'administrateur qui détient la clé privée Ed25519
(commande `acces_preparer_activation`). Le poste ne connaît que la clé publique, embarquée dans le code
(`cle_publique_activation.pem`, lue par `settings.ACCES_CLES_PUBLIQUES`) : sans la clé privée, personne ne peut
fabriquer un fichier accepté, et une installation vierge reste sans aucun compte.

Format : {"charge": base64(JSON), "signature": base64(signature Ed25519 des octets de la charge)}.

Aucun fichier n'expire : seules la signature, l'intégrité, l'unicité (un fichier ne se rejoue pas) et, le cas
échéant, la liaison à un poste (`poste`) sont vérifiées. Les champs de date d'expiration des anciens fichiers sont
ignorés. Un fichier de réinitialisation (récupération d'un compte) doit être lié au poste.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List

from django.conf import settings
from django.contrib.auth.hashers import identify_hasher
from django.db import transaction
from django.utils.dateparse import parse_datetime

from contextes.commun.erreurs import RefusMetier
from domaine.acces.regions import region_canonique

from . import horloge
from .journal import evenement
from .models import (ETAT_ACTIF, ETAT_REVOQUE, ROLE_DELEGUE, ROLE_DRH, ActivationAppliquee, Compte,
                     EvenementAcces)

FORMAT = "algoplanr-activation"
VERSION = 1

# Actions autorisées par type de fichier.
ACTIONS_PAR_TYPE = {
    "initiale": {"creer_compte"},
    "ajout": {"creer_compte"},
    "reaffectation": {"reaffecter"},
    "revocation": {"revoquer"},
    "reinitialisation": {"reinitialiser"},
}

ETAT_VIERGE = "vierge"
ETAT_ACTIVE = "active"
ETAT_INVALIDE = "invalide"


class ActivationRefusee(RefusMetier):
    def __init__(self, message: str, motifs: List[str] | None = None, code: str = "activation_refusee"):
        super().__init__(message, motifs, code)


def etat_registre() -> str:
    """vierge : aucun compte ni activation ; active : registre cohérent ; invalide : registre incohérent.

    Un registre invalide n'est jamais réinitialisé automatiquement : il faut un fichier signé pour le réparer.
    """
    nb_comptes = Compte.objects.count()
    nb_activations = ActivationAppliquee.objects.count()
    if nb_comptes == 0 and nb_activations == 0:
        return ETAT_VIERGE
    if nb_comptes == 0 or nb_activations == 0 or Compte.objects.filter(cree_par_activation__isnull=True).exists():
        return ETAT_INVALIDE
    return ETAT_ACTIVE


# --- Lecture et vérification --------------------------------------------------------------------------------


def _cles_publiques():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    cles = []
    for pem in getattr(settings, "ACCES_CLES_PUBLIQUES", []) or []:
        cle = load_pem_public_key(pem.encode() if isinstance(pem, str) else pem)
        if isinstance(cle, Ed25519PublicKey):
            cles.append(cle)
    return cles


def verifier_enveloppe(contenu: bytes) -> Dict[str, Any]:
    """Vérifie la signature d'un fichier de l'administration (activation, catalogue, carnet) et renvoie sa charge.

    @raises ActivationRefusee si le fichier est illisible, non signé, signé par une autre clé ou altéré.
    """
    from cryptography.exceptions import InvalidSignature

    try:
        enveloppe = json.loads(contenu.decode("utf-8-sig"))
        charge_brute = base64.b64decode(enveloppe["charge"], validate=True)
        signature = base64.b64decode(enveloppe["signature"], validate=True)
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, binascii.Error):
        raise ActivationRefusee("Fichier d'activation illisible", code="activation_illisible")
    cles = _cles_publiques()
    if not cles:
        raise ActivationRefusee("Aucune clé publique d'activation n'est installée sur ce poste",
                                code="activation_sans_cle")
    for cle in cles:
        try:
            cle.verify(signature, charge_brute)
            break
        except InvalidSignature:
            continue
    else:
        raise ActivationRefusee("Signature du fichier d'activation invalide",
                                ["Le fichier n'a pas été émis par l'administration AlgoPlanR, ou il a été modifié."],
                                code="signature_invalide")
    try:
        charge = json.loads(charge_brute.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ActivationRefusee("Contenu du fichier d'activation illisible", code="activation_illisible")
    if not isinstance(charge, dict):
        raise ActivationRefusee("Contenu du fichier d'activation illisible", code="activation_illisible")
    charge["_empreinte"] = hashlib.sha256(contenu).hexdigest()
    return charge


def lire_fichier(contenu: bytes) -> Dict[str, Any]:
    """Fichier d'activation : signature vérifiée, format `algoplanr-activation`."""
    charge = verifier_enveloppe(contenu)
    if charge.get("format") != FORMAT or charge.get("version") != VERSION:
        raise ActivationRefusee("Format de fichier d'activation non pris en charge", code="activation_format")
    return charge


def identifiant_poste() -> str:
    """Identifiant administratif du poste, tiré au premier appel."""
    from .models import Poste

    poste = Poste.objects.order_by("id").first() or Poste.objects.create()
    return str(poste.identifiant)


def verifier_poste(charge: Dict[str, Any], *, obligatoire: bool = False) -> None:
    """Fichier lié à un poste : il n'est accepté que sur ce poste."""
    attendu = str(charge.get("poste") or "").strip().lower()
    if not attendu:
        if obligatoire:
            raise ActivationRefusee("Fichier non lié à ce poste",
                                    ["Un fichier de récupération doit désigner le poste (identifiant affiché à "
                                     "l'écran d'activation)."], code="poste_obligatoire")
        return
    if attendu != identifiant_poste():
        raise ActivationRefusee("Ce fichier est destiné à un autre poste",
                                [f"Identifiant de ce poste : {identifiant_poste()}"], code="poste_non_autorise")


def _date(valeur: Any, nom: str) -> datetime:
    d = parse_datetime(str(valeur or ""))
    if d is None or d.tzinfo is None:
        raise ActivationRefusee("Fichier d'activation invalide", [f"Date « {nom} » absente ou invalide"])
    return d


def _hache_valide(valeur: Any) -> str:
    """Le mot de passe temporaire doit arriver haché : un mot de passe en clair est refusé."""
    if not isinstance(valeur, str) or not valeur:
        raise ActivationRefusee("Fichier d'activation invalide", ["Empreinte de mot de passe manquante"])
    try:
        identify_hasher(valeur)
    except ValueError:
        raise ActivationRefusee("Fichier d'activation invalide",
                                ["Le mot de passe temporaire doit être transmis haché, jamais en clair"])
    return valeur


# --- Application ---------------------------------------------------------------------------------------------


def _compte(identifiant: Any) -> Compte:
    c = Compte.objects.filter(identifiant=str(identifiant or "")).first()
    if c is None:
        raise ActivationRefusee("Fichier d'activation invalide", [f"Compte inconnu : {identifiant}"])
    return c


def _fermer_sessions(compte: Compte, motif: str) -> None:
    compte.sessions.filter(fermee_le__isnull=True).update(fermee_le=horloge.maintenant(), motif_fermeture=motif)


def _creer_compte(op: dict, activation: ActivationAppliquee) -> Compte:
    identifiant = str(op.get("identifiant", "")).strip().lower()
    role = op.get("role")
    if not identifiant or role not in (ROLE_DRH, ROLE_DELEGUE):
        raise ActivationRefusee("Fichier d'activation invalide", [f"Compte mal décrit : {identifiant or '?'}"])
    region = None
    if role == ROLE_DELEGUE:
        region = region_canonique(op.get("region"))
        if region is None:
            raise ActivationRefusee("Fichier d'activation invalide",
                                    [f"Région inconnue pour {identifiant} : {op.get('region')}"])
    if Compte.objects.filter(identifiant=identifiant).exists():
        raise ActivationRefusee("Fichier d'activation invalide", [f"Le compte {identifiant} existe déjà"])
    # Aucun mot de passe n'expire : une éventuelle date `temporaire_expire_le` des anciens fichiers est ignorée.
    return Compte.objects.create(
        identifiant=identifiant, nom_affiche=str(op.get("nom_affiche", ""))[:150], role=role, region=region,
        etat=ETAT_ACTIF, mot_de_passe=_hache_valide(op.get("mot_de_passe_hache")), mdp_temporaire=True,
        mdp_temporaire_expire_le=None, cree_par_activation=activation)


def _cle_carnet(op: dict, compte: Compte) -> None:
    """Clé du carnet embarqué, enveloppée par le mot de passe temporaire du DRH : gardée jusqu'à la création de son
    mot de passe personnel, qui installe le carnet (coffre.installer_en_attente)."""
    from .models import CleCarnetEnAttente

    enveloppe = op.get("carnet")
    if enveloppe is None:
        return
    if not compte.est_drh or not isinstance(enveloppe, dict) or not all(
            isinstance(enveloppe.get(k), str) for k in ("sel", "nonce", "chiffre")):
        raise ActivationRefusee("Fichier d'activation invalide", ["Clé de carnet mal décrite"])
    CleCarnetEnAttente.objects.update_or_create(compte=compte, defaults={"enveloppe": enveloppe})


@transaction.atomic
def appliquer(contenu: bytes, auteur: str = "") -> ActivationAppliquee:
    """Vérifie puis applique un fichier d'activation, entièrement ou pas du tout."""
    charge = lire_fichier(contenu)
    type_ = charge.get("type")
    if type_ not in ACTIONS_PAR_TYPE:
        raise ActivationRefusee("Type de fichier d'activation inconnu", [str(type_)])
    try:
        ident = uuid.UUID(str(charge.get("id")))
    except ValueError:
        raise ActivationRefusee("Fichier d'activation invalide", ["Identifiant du fichier invalide"])
    emise = _date(charge.get("emise_le"), "emise_le")
    verifier_poste(charge, obligatoire=type_ == "reinitialisation")
    if ActivationAppliquee.objects.filter(pk=ident).exists():
        raise ActivationRefusee("Ce fichier d'activation a déjà été appliqué", code="activation_rejouee")
    etat = etat_registre()
    if type_ == "initiale" and etat != ETAT_VIERGE:
        raise ActivationRefusee("Ce poste est déjà activé",
                                ["Une activation initiale n'est acceptée que sur un registre vierge"],
                                code="deja_active")
    if type_ != "initiale" and etat == ETAT_VIERGE:
        raise ActivationRefusee("Ce poste n'est pas encore activé",
                                ["Appliquez d'abord le fichier d'activation initiale"], code="non_active")

    operations = charge.get("operations")
    if not isinstance(operations, list) or not operations:
        raise ActivationRefusee("Fichier d'activation vide")
    autorisees = ACTIONS_PAR_TYPE[type_]
    if any(not isinstance(op, dict) or op.get("action") not in autorisees for op in operations):
        raise ActivationRefusee("Fichier d'activation invalide",
                                [f"Seules ces actions sont permises pour « {type_} » : {', '.join(sorted(autorisees))}"])
    if type_ == "initiale" and not any(op.get("role") == ROLE_DRH for op in operations):
        raise ActivationRefusee("Fichier d'activation invalide", ["L'activation initiale doit créer le compte du DRH"])

    activation = ActivationAppliquee.objects.create(id=ident, type=type_, emise_le=emise,
                                                    empreinte_fichier=charge["_empreinte"])
    resume: List[str] = []
    for op in operations:
        action = op["action"]
        if action == "creer_compte":
            c = _creer_compte(op, activation)
            _cle_carnet(op, c)
            evenement(c, EvenementAcces.ACTIVATION, auteur, {"activation": str(ident), "role": c.role,
                                                               "region": c.region})
            resume.append(f"Compte créé : {c.identifiant}")
        elif action == "reaffecter":
            c = _compte(op.get("identifiant"))
            region = region_canonique(op.get("region"))
            if not c.est_delegue or region is None:
                raise ActivationRefusee("Réaffectation invalide", [f"{c.identifiant} → {op.get('region')}"])
            ancienne = c.region
            c.region, c.region_confirmee_le = region, None
            c.save(update_fields=["region", "region_confirmee_le"])
            _fermer_sessions(c, "reaffectation")
            evenement(c, EvenementAcces.REAFFECTATION, auteur, {"activation": str(ident), "de": ancienne,
                                                                  "vers": region})
            resume.append(f"Région de {c.identifiant} : {ancienne} → {region}")
        elif action == "revoquer":
            c = _compte(op.get("identifiant"))
            c.etat = ETAT_REVOQUE
            c.save(update_fields=["etat"])
            _fermer_sessions(c, "revocation")
            evenement(c, EvenementAcces.REVOCATION, auteur, {"activation": str(ident)})
            resume.append(f"Compte révoqué : {c.identifiant}")
        elif action == "reinitialiser":
            c = _compte(op.get("identifiant"))
            if c.etat == ETAT_REVOQUE:
                raise ActivationRefusee("Réinitialisation impossible", [f"{c.identifiant} est révoqué"])
            c.mot_de_passe = _hache_valide(op.get("mot_de_passe_hache"))
            c.mdp_temporaire = True
            c.mdp_temporaire_expire_le = None
            c.echecs_consecutifs, c.bloque_jusqu_au = 0, None
            c.save(update_fields=["mot_de_passe", "mdp_temporaire", "mdp_temporaire_expire_le",
                                  "echecs_consecutifs", "bloque_jusqu_au"])
            _fermer_sessions(c, "reinitialisation")
            _cle_carnet(op, c)
            evenement(c, EvenementAcces.REINITIALISATION, auteur, {"activation": str(ident)})
            resume.append(f"Mot de passe temporaire posé : {c.identifiant}")
    activation.resume = {"type": type_, "operations": resume}
    activation.save(update_fields=["resume"])
    return activation


# --- Préparation (machine de l'administrateur) ----------------------------------------------------------------


def signer(charge: Dict[str, Any], cle_privee_pem: bytes) -> bytes:
    """Construit le fichier signé d'une charge. Utilisé par la commande d'administration et par les tests."""
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    cle = load_pem_private_key(cle_privee_pem, password=None)
    brute = json.dumps(charge, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return json.dumps({"charge": base64.b64encode(brute).decode(),
                       "signature": base64.b64encode(cle.sign(brute)).decode()}, indent=1).encode("utf-8")
