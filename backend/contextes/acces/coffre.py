"""Carnet des codes du DRH, chiffré au repos sur son poste.

Le carnet (les codes en clair, tirés au hasard par l'administration) est livré **chiffré** avec l'installation
(`carnet_codes.algoplanr-carnet`, signé). Sa clé n'est apportée que par le fichier d'activation (ou de récupération)
du DRH, enveloppée par son mot de passe temporaire : les postes des délégués n'ont que le texte chiffré, sans clé.
À la création du mot de passe personnel du DRH, le carnet est installé dans le coffre du poste : rechiffré par une
clé de données aléatoire (AES-256-GCM), enveloppée par le mot de passe du DRH et par une clé de secours affichée
une seule fois.

  - changement de mot de passe : la clé est réenveloppée avec le nouveau, dans la même transaction ;
  - mot de passe réinitialisé par fichier signé : l'ancienne enveloppe ne s'ouvre plus, le coffre est verrouillé
    jusqu'à la saisie de la clé de secours (qui est alors renouvelée) ;
  - clé de secours perdue : réimporter le carnet de l'administration ; les remises enregistrées sont conservées.

Le journal ne contient jamais de code : seulement l'identifiant d'entrée, la région et l'usage.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from django.contrib.auth.hashers import check_password
from django.db import transaction

from domaine.acces import codes as dom
from domaine.acces.regions import REGIONS_CAMEROUN, region_canonique

from . import horloge
from .activation import ActivationRefusee, verifier_enveloppe
from .codes_acces import CodeRefuse, revoques
from .journal import evenement
from .models import CleCarnetEnAttente, CoffreCarnet, Compte, EvenementAcces, RemiseCode

FORMAT_CARNET = "algoplanr-carnet"
VERSION_CARNET = 1


def _coffre() -> Optional[CoffreCarnet]:
    return CoffreCarnet.objects.order_by("id").first()


def _verifier_mot_de_passe(drh: Compte, mot_de_passe: str) -> None:
    if not check_password(mot_de_passe or "", drh.mot_de_passe):
        raise CodeRefuse("Mot de passe incorrect.", "mot_de_passe_incorrect")


def _codes(cle: bytes, coffre: CoffreCarnet) -> List[dict]:
    if not coffre.carnet:
        return []
    return json.loads(dom.dechiffrer(cle, coffre.carnet).decode("utf-8"))


def _ouvrir(coffre: CoffreCarnet, mot_de_passe: str) -> bytes:
    if coffre.verrouille:
        raise CodeRefuse("Le carnet est verrouillé depuis la réinitialisation du mot de passe : débloquez-le avec la "
                         "clé de secours, ou réimportez le carnet de l'administration.", "carnet_verrouille", statut=409)
    try:
        return dom.desenvelopper(coffre.cle_mot_de_passe, mot_de_passe)
    except dom.DechiffrementImpossible:
        raise CodeRefuse("Mot de passe incorrect.", "mot_de_passe_incorrect")


def lire_fichier_carnet(contenu: bytes, phrase: str) -> List[dict]:
    """Fichier signé de l'administration, déchiffré par la phrase transmise à part."""
    charge = verifier_enveloppe(contenu)
    if charge.get("format") != FORMAT_CARNET or charge.get("version") != VERSION_CARNET:
        raise ActivationRefusee("Format de carnet de codes non pris en charge", code="carnet_format")
    try:
        cle = dom.deriver_cle(phrase or "", dom.deb64(charge["sel"]), charge.get("params") or dom.PARAMS_COFFRE)
        codes = json.loads(dom.dechiffrer(cle, charge).decode("utf-8"))
    except (dom.DechiffrementImpossible, KeyError, ValueError):
        raise CodeRefuse("Phrase du carnet incorrecte, ou carnet altéré.", "phrase_incorrecte")
    propres = []
    for c in codes:
        if (not isinstance(c, dict) or region_canonique(c.get("region")) != c.get("region")
                or c.get("usage") not in dom.USAGES or not dom.est_bien_forme(c.get("code", ""))
                or not str(c.get("id") or "")):
            raise ActivationRefusee("Carnet de codes invalide", ["Entrée mal décrite"])
        propres.append({"id": str(c["id"]), "region": c["region"], "usage": c["usage"],
                        "code": dom.normaliser(c["code"])})
    return [{"numero": charge.get("numero"), **c} for c in propres]


def _fusionner(drh: Compte, nouveaux: List[dict], *, ouvrir_avec: str, envelopper_avec: str) -> dict:
    """Ajoute des codes au coffre. Un coffre absent, verrouillé ou qui ne s'ouvre pas avec `ouvrir_avec` reçoit une
    nouvelle clé de données et une nouvelle clé de secours (renvoyée) ; les remises déjà faites sont conservées."""
    numero = nouveaux[0]["numero"] if nouveaux else None
    coffre = CoffreCarnet.objects.select_for_update().order_by("id").first()
    cle_secours, cle, anciens = None, None, []
    if coffre is not None and not coffre.verrouille:
        try:
            cle = dom.desenvelopper(coffre.cle_mot_de_passe, ouvrir_avec)
            anciens = _codes(cle, coffre)
        except dom.DechiffrementImpossible:
            cle = None
    if cle is None:
        cle = dom.nouvelle_cle_donnees()
        cle_secours = dom.nouvelle_cle_secours()
        coffre = coffre or CoffreCarnet()
        coffre.cle_secours = dom.envelopper(cle, dom.normaliser(cle_secours))
        coffre.numeros = []
    par_id = {c["id"]: c for c in anciens}
    for c in nouveaux:
        par_id[c["id"]] = {k: c[k] for k in ("id", "region", "usage", "code")}
    tous = sorted(par_id.values(), key=lambda c: c["id"])
    coffre.carnet = dom.chiffrer(cle, json.dumps(tous).encode("utf-8"))
    coffre.cle_mot_de_passe = dom.envelopper(cle, envelopper_avec)
    coffre.index = [{"id": c["id"], "region": c["region"], "usage": c["usage"]} for c in tous]
    coffre.numeros = sorted(set(coffre.numeros) | ({numero} if numero is not None else set()))
    coffre.verrouille = False
    coffre.save()
    evenement(drh, EvenementAcces.CARNET_IMPORTE, details={"numero": numero, "codes": len(nouveaux),
                                                           "total": len(tous), "nouvelle_cle": bool(cle_secours)})
    return {"numero": numero, "codes_ajoutes": len(nouveaux), "total": len(tous), "cle_secours": cle_secours}


@transaction.atomic
def importer(drh: Compte, contenu: bytes, phrase: str, mot_de_passe: str) -> dict:
    """Carnet supplémentaire remis par fichier (renouvellement des codes), ouvert par sa clé."""
    _verifier_mot_de_passe(drh, mot_de_passe)
    return _fusionner(drh, lire_fichier_carnet(contenu, phrase), ouvrir_avec=mot_de_passe, envelopper_avec=mot_de_passe)


def carnet_embarque() -> Optional[bytes]:
    from pathlib import Path

    from django.conf import settings
    chemin = getattr(settings, "ACCES_CARNET_EMBARQUE", None)
    return Path(chemin).read_bytes() if chemin and Path(chemin).is_file() else None


def installer_en_attente(drh: Compte, ancien: str, nouveau: str) -> Optional[str]:
    """Dans la transaction du changement de mot de passe du DRH. Si son fichier d'activation (ou de récupération)
    a apporté la clé du carnet, le carnet embarqué est installé dans le coffre ; renvoie la nouvelle clé de secours.
    Sinon, la clé de données est simplement réenveloppée avec le nouveau mot de passe."""
    attente = CleCarnetEnAttente.objects.filter(compte=drh).first()
    contenu = carnet_embarque() if attente else None
    if attente is None or contenu is None:
        reenvelopper(drh, ancien, nouveau)
        return None
    try:
        cle_carnet = dom.desenvelopper(attente.enveloppe, ancien).decode("utf-8")
    except (dom.DechiffrementImpossible, UnicodeDecodeError):
        reenvelopper(drh, ancien, nouveau)
        return None
    bilan = _fusionner(drh, lire_fichier_carnet(contenu, cle_carnet), ouvrir_avec=ancien, envelopper_avec=nouveau)
    attente.delete()
    return bilan["cle_secours"]


@transaction.atomic
def debloquer(drh: Compte, cle_secours: str, mot_de_passe: str) -> dict:
    """Clé de secours : réenveloppe la clé de données avec le mot de passe actuel et renouvelle la clé de secours."""
    _verifier_mot_de_passe(drh, mot_de_passe)
    coffre = CoffreCarnet.objects.select_for_update().order_by("id").first()
    if coffre is None:
        raise CodeRefuse("Aucun carnet sur ce poste.", "carnet_absent", statut=404)
    try:
        cle = dom.desenvelopper(coffre.cle_secours, dom.normaliser(cle_secours))
    except dom.DechiffrementImpossible:
        evenement(drh, EvenementAcces.ECHEC_CODE, details={"raison": "cle_secours"})
        raise CodeRefuse("Clé de secours incorrecte.", "cle_secours_incorrecte")
    nouvelle = dom.nouvelle_cle_secours()
    coffre.cle_mot_de_passe = dom.envelopper(cle, mot_de_passe)
    coffre.cle_secours = dom.envelopper(cle, dom.normaliser(nouvelle))
    coffre.verrouille = False
    coffre.save()
    evenement(drh, EvenementAcces.CARNET_DEBLOQUE)
    return {"cle_secours": nouvelle}


def reenvelopper(drh: Compte, ancien: str, nouveau: str) -> None:
    """Appelé dans la transaction du changement de mot de passe du DRH. Si l'ancienne enveloppe ne s'ouvre pas
    (mot de passe réinitialisé par fichier signé), le coffre est verrouillé : la clé de secours le rouvrira."""
    coffre = CoffreCarnet.objects.select_for_update().order_by("id").first()
    if coffre is None or coffre.verrouille:
        return
    try:
        cle = dom.desenvelopper(coffre.cle_mot_de_passe, ancien)
    except dom.DechiffrementImpossible:
        coffre.verrouille = True
        coffre.save(update_fields=["verrouille", "maj_le"])
        evenement(drh, EvenementAcces.CARNET_VERROUILLE)
        return
    coffre.cle_mot_de_passe = dom.envelopper(cle, nouveau)
    coffre.save(update_fields=["cle_mot_de_passe", "maj_le"])


@transaction.atomic
def remettre(drh: Compte, region_saisie: str, usage: str, mot_de_passe: str, remis_a: str = "") -> dict:
    """Prochain code disponible (ni remis, ni révoqué) d'une région et d'un usage ; enregistre la remise."""
    region = region_canonique(region_saisie)
    if region is None:
        raise CodeRefuse("Région inconnue", "region_inconnue")
    if usage not in dom.USAGES:
        raise CodeRefuse("Usage du code inconnu", "usage_inconnu")
    _verifier_mot_de_passe(drh, mot_de_passe)
    coffre = CoffreCarnet.objects.select_for_update().order_by("id").first()
    if coffre is None:
        raise CodeRefuse("Aucun carnet sur ce poste : importez le carnet remis par l'administration.",
                         "carnet_absent", statut=404)
    cle = _ouvrir(coffre, mot_de_passe)
    deja = set(RemiseCode.objects.values_list("entree", flat=True))
    exclus = deja | revoques()
    choix = next((c for c in _codes(cle, coffre)
                  if c["region"] == region and c["usage"] == usage and c["id"] not in exclus), None)
    if choix is None:
        raise CodeRefuse(f"Plus aucun code {usage} disponible pour {region} : demandez un nouveau carnet.",
                         "carnet_epuise", statut=409)
    RemiseCode.objects.create(entree=choix["id"], region=region, usage=usage, remis_le=horloge.maintenant(),
                              remis_a=(remis_a or "")[:150], remis_par=drh.identifiant)
    evenement(drh, EvenementAcces.CODE_REMIS, details={"entree": choix["id"], "region": region, "usage": usage,
                                                       "remis_a": (remis_a or "")[:150]})
    return {"code": choix["code"], "entree": choix["id"], "region": region, "usage": usage}


def synthese() -> dict:
    """État du carnet sans le déchiffrer : codes disponibles et remis par région et par usage."""
    coffre = _coffre()
    remis = {r.entree: r for r in RemiseCode.objects.all()}
    exclus = revoques()
    regions: List[Dict[str, Any]] = []
    for region in REGIONS_CAMEROUN:
        ligne: Dict[str, Any] = {"region": region}
        for usage in dom.USAGES:
            ids = [e["id"] for e in (coffre.index if coffre else []) if e["region"] == region and e["usage"] == usage]
            ligne[usage] = {"total": len(ids), "remis": sum(1 for i in ids if i in remis),
                            "revoques": sum(1 for i in ids if i in exclus),
                            "disponibles": sum(1 for i in ids if i not in remis and i not in exclus)}
        regions.append(ligne)
    return {"present": coffre is not None, "verrouille": bool(coffre and coffre.verrouille),
            "carnets": coffre.numeros if coffre else [], "regions": regions,
            "remises": [{"entree": r.entree, "region": r.region, "usage": r.usage, "remis_le": r.remis_le,
                         "remis_a": r.remis_a, "remis_par": r.remis_par} for r in list(remis.values())[:200]]}
