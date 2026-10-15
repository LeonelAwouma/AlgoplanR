"""Activation et récupération hors ligne des comptes de délégués par code d'accès.

Le poste ne connaît aucun code : il vérifie le code saisi contre les catalogues signés par l'administration
(catalogue embarqué dans l'installation, puis catalogues importés). Un code accepté ouvre une session limitée à la
création du mot de passe ; il n'est consommé — définitivement, pour ce poste — qu'au moment où ce mot de passe est
enregistré (services.changer_mot_de_passe, dans la même transaction).

Les codes d'activation n'expirent jamais. Les codes de récupération sont distincts et à usage unique.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction

from contextes.commun.erreurs import RefusMetier
from domaine.acces import codes as dom
from domaine.acces.regions import CODES_REGIONS, identifiant_delegue, region_canonique

from . import horloge
from .activation import ActivationRefusee, verifier_enveloppe
from .journal import evenement
from .models import (ETAT_REVOQUE, PORTEE_CHANGEMENT_MDP, ROLE_DELEGUE, ROLE_DRH, ActivationAppliquee,
                     CatalogueCodes, CodeConsomme, CodeEnAttente, Compte, EvenementAcces)

FORMAT_CATALOGUE = "algoplanr-catalogue"
VERSION_CATALOGUE = 1


class CodeRefuse(RefusMetier):
    statut = 403

    def __init__(self, message: str, code: str = "code_refuse", motifs=None, statut: int = 403):
        super().__init__(message, motifs, code)
        self.statut = statut


# --- Catalogues --------------------------------------------------------------------------------------------------

def _valider_catalogue(charge: Dict[str, Any]) -> Dict[str, Any]:
    if charge.get("format") != FORMAT_CATALOGUE or charge.get("version") != VERSION_CATALOGUE:
        raise ActivationRefusee("Format de catalogue de codes non pris en charge", code="catalogue_format")
    numero = charge.get("numero")
    if not isinstance(numero, int) or numero < 1:
        raise ActivationRefusee("Catalogue de codes invalide", ["Numéro de catalogue absent"])
    params = charge.get("params") or {}
    if not all(isinstance(params.get(k), int) and params[k] > 0 for k in ("n", "r", "p")):
        raise ActivationRefusee("Catalogue de codes invalide", ["Paramètres scrypt absents"])
    for g in charge.get("groupes") or []:
        if region_canonique(g.get("region")) != g.get("region") or g.get("usage") not in dom.USAGES:
            raise ActivationRefusee("Catalogue de codes invalide", [f"Groupe mal décrit : {g.get('region')}"])
    return charge


def _embarque() -> Optional[Dict[str, Any]]:
    """Catalogue livré avec l'installation ; ignoré s'il est absent ou s'il n'est pas signé par une clé du poste."""
    chemin = getattr(settings, "ACCES_CATALOGUE_EMBARQUE", None)
    if not chemin or not Path(chemin).is_file():
        return None
    try:
        return _valider_catalogue(verifier_enveloppe(Path(chemin).read_bytes()))
    except ActivationRefusee:
        return None


def catalogues() -> List[Dict[str, Any]]:
    """Catalogues valides du poste (embarqué puis importés), revérifiés à chaque lecture, par numéro croissant."""
    liste: Dict[int, Dict[str, Any]] = {}
    emb = _embarque()
    if emb:
        liste[emb["numero"]] = emb
    for c in CatalogueCodes.objects.all():
        try:
            charge = _valider_catalogue(verifier_enveloppe(bytes(c.contenu)))
        except ActivationRefusee:
            continue
        liste[charge["numero"]] = charge
    return [liste[k] for k in sorted(liste)]


def revoques(liste: Optional[List[dict]] = None) -> set:
    return {i for c in (liste if liste is not None else catalogues()) for i in c.get("revoques") or []}


def importer_catalogue(contenu: bytes, charge: Optional[Dict[str, Any]] = None, *, auteur: str = "") -> dict:
    charge = _valider_catalogue(charge or verifier_enveloppe(contenu))
    existants = {c["numero"] for c in catalogues()}
    if existants and charge["numero"] <= max(existants):
        raise ActivationRefusee("Ce catalogue n'est pas plus récent que celui du poste",
                                [f"Catalogue du poste : n° {max(existants)} ; fichier : n° {charge['numero']}"],
                                code="catalogue_ancien")
    CatalogueCodes.objects.create(numero=charge["numero"], contenu=contenu)
    nb = sum(len(g["verificateurs"]) for g in charge.get("groupes") or [])
    evenement(None, EvenementAcces.CATALOGUE_IMPORTE, auteur,
              {"numero": charge["numero"], "codes": nb, "revoques": len(charge.get("revoques") or [])})
    return {"numero": charge["numero"], "codes": nb, "revoques": len(charge.get("revoques") or [])}


def trouver(code: str, region: str, usage: str) -> Optional[str]:
    """Identifiant d'entrée correspondant au code (un calcul scrypt par catalogue qui couvre la région)."""
    trouve = None
    for c in catalogues():
        for g in c.get("groupes") or []:
            if g["region"] == region and g["usage"] == usage:
                ident = dom.chercher(code, g, c["params"])
                if ident:
                    trouve = ident
    return trouve


# --- Saisie d'un code ------------------------------------------------------------------------------------------

def _reglage(nom: str, defaut):
    return getattr(settings, nom, defaut)


def _verifier_blocage() -> None:
    """Après N codes refusés en M minutes sur ce poste, la saisie est suspendue M minutes."""
    duree = timedelta(minutes=_reglage("ACCES_DUREE_BLOCAGE_MIN", 15))
    maintenant = horloge.maintenant()
    echecs = list(EvenementAcces.objects.filter(type=EvenementAcces.ECHEC_CODE, le__gte=maintenant - duree)
                  .order_by("-le").values_list("le", flat=True)[:_reglage("ACCES_ESSAIS_AVANT_BLOCAGE", 5)])
    if len(echecs) >= _reglage("ACCES_ESSAIS_AVANT_BLOCAGE", 5):
        fin = echecs[0] + duree
        minutes = max(1, int((fin - maintenant).total_seconds() // 60) + 1)
        raise CodeRefuse(f"Trop de codes refusés sur ce poste. Réessayez dans {minutes} minute(s).",
                         "codes_bloques", statut=429)


def _echec(region: str, usage: str, raison: str, message: str, code: str = "code_invalide") -> CodeRefuse:
    evenement(None, EvenementAcces.ECHEC_CODE, details={"region": region, "usage": usage, "raison": raison})
    return CodeRefuse(message, code)


def utiliser_code(region_saisie: str, usage: str, code: str):
    """Vérifie un code d'activation ou de récupération et ouvre une session de création du mot de passe.

    Renvoie (compte, jeton, session). Aucune donnée métier n'est modifiée.
    """
    from .services import fermer_sessions, ouvrir_session

    region = region_canonique(region_saisie)
    if region is None or region not in CODES_REGIONS:
        raise CodeRefuse("Région inconnue", "region_inconnue")
    if usage not in dom.USAGES:
        raise CodeRefuse("Usage du code inconnu", "usage_inconnu")
    _verifier_blocage()
    if Compte.objects.filter(role=ROLE_DRH).exists():
        raise CodeRefuse("Ce poste est celui du DRH : les codes d'accès servent aux postes des délégués.",
                         "poste_drh")
    autre = Compte.objects.filter(role=ROLE_DELEGUE).exclude(region=region).first()
    if autre is not None:
        raise CodeRefuse(f"Ce poste est attribué à la région {autre.region}.", "poste_autre_region")
    compte = Compte.objects.filter(identifiant=identifiant_delegue(region)).first()
    if compte is not None and compte.etat == ETAT_REVOQUE:
        raise CodeRefuse("Ce compte a été révoqué. Contactez l'administration AlgoPlanR.", "compte_revoque")
    if usage == "activation" and compte is not None and not compte.mdp_temporaire:
        raise CodeRefuse("Le compte de cette région est déjà activé sur ce poste : en cas d'oubli du mot de passe, "
                         "utilisez un code de récupération.", "deja_active", statut=409)
    if usage == "recuperation" and compte is None:
        raise CodeRefuse("Aucun compte de cette région sur ce poste : utilisez un code d'activation.",
                         "compte_absent", statut=409)
    if not dom.est_bien_forme(code):
        raise _echec(region, usage, "forme", f"Le code doit compter {dom.LONGUEUR} caractères (lettres et chiffres).")
    entree = trouver(code, region, usage)
    if entree is None:
        raise _echec(region, usage, "inconnu", "Code incorrect pour cette région.")
    if entree in revoques():
        raise _echec(region, usage, "revoque", "Ce code a été révoqué par l'administration.", "code_revoque")
    if CodeConsomme.objects.filter(entree=entree).exists():
        raise _echec(region, usage, "consomme", "Ce code a déjà été utilisé sur ce poste.", "code_deja_utilise")

    maintenant = horloge.maintenant()
    with transaction.atomic():
        activation = ActivationAppliquee.objects.create(
            id=uuid.uuid4(), type=f"code_{usage}", emise_le=maintenant,
            empreinte_fichier=hashlib.sha256(entree.encode()).hexdigest(),
            resume={"type": f"code_{usage}", "region": region, "entree": entree})
        hache = make_password(dom.normaliser(code))
        if compte is None:
            compte = Compte.objects.create(
                identifiant=identifiant_delegue(region), nom_affiche=f"Délégué régional — {region}",
                role=ROLE_DELEGUE, region=region, mot_de_passe=hache, mdp_temporaire=True,
                mdp_temporaire_expire_le=None, region_confirmee_le=maintenant, cree_par_activation=activation)
        else:
            compte.mot_de_passe, compte.mdp_temporaire, compte.mdp_temporaire_expire_le = hache, True, None
            compte.echecs_consecutifs, compte.bloque_jusqu_au = 0, None
            if compte.region_confirmee_le is None:
                compte.region_confirmee_le = maintenant
            compte.save(update_fields=["mot_de_passe", "mdp_temporaire", "mdp_temporaire_expire_le",
                                       "echecs_consecutifs", "bloque_jusqu_au", "region_confirmee_le"])
        CodeEnAttente.objects.update_or_create(compte=compte, defaults={"entree": entree, "usage": usage,
                                                                       "cree_le": maintenant})
        fermer_sessions(compte, f"code_{usage}")
        jeton, session = ouvrir_session(compte, PORTEE_CHANGEMENT_MDP)
        evenement(compte, EvenementAcces.CODE_ACCEPTE, details={"region": region, "usage": usage, "entree": entree})
    return compte, jeton, session


def consommer_en_attente(compte: Compte) -> Optional[str]:
    """Dans la transaction du changement de mot de passe : consomme le code en attente, ou refuse (409) s'il a
    déjà été consommé. Renvoie l'identifiant d'entrée consommé."""
    from django.db import IntegrityError

    attente = CodeEnAttente.objects.filter(compte=compte).first()
    if attente is None:
        return None
    try:
        with transaction.atomic():
            CodeConsomme.objects.create(entree=attente.entree, region=compte.region or "", usage=attente.usage,
                                        compte=compte, consomme_le=horloge.maintenant())
    except IntegrityError:
        raise CodeRefuse("Ce code a déjà été utilisé sur ce poste.", "code_deja_utilise", statut=409)
    entree = attente.entree
    attente.delete()
    evenement(compte, EvenementAcces.CODE_CONSOMME, details={"entree": entree, "usage": attente.usage})
    return entree


def profil_poste() -> Tuple[Optional[str], Optional[str]]:
    """(« drh » | « region » | None, région du poste) : ce que l'écran d'accès doit proposer."""
    if Compte.objects.filter(role=ROLE_DRH).exists():
        return "drh", None
    delegue = Compte.objects.filter(role=ROLE_DELEGUE).order_by("identifiant").first()
    if delegue is not None:
        regions = set(Compte.objects.filter(role=ROLE_DELEGUE).values_list("region", flat=True))
        return "region", delegue.region if len(regions) == 1 else None
    return None, None
