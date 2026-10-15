"""Journal d'audit transverse : chaque décision et chaque recalcul d'un jeu y laisse un événement."""
from __future__ import annotations

import json
from typing import Any, Optional

from .models import EvenementAudit

TYPES = ("import", "actualisation", "validation_donnees", "parametres", "hypotheses", "scenario_retenu",
         "fait_prince", "arbitrage", "recrues", "nomination", "quota", "mouvement", "recalcul")


def auteur_de(request, saisi: Any = None) -> str:
    """Auteur déclaré dans le corps de la requête, à défaut le nom du compte connecté."""
    texte = str(saisi or "").strip()
    if texte:
        return texte[:150]
    compte = getattr(request, "user", None)
    return (getattr(compte, "nom_affiche", "") or getattr(compte, "identifiant", "") or "")[:150]


def _json(valeur: Any) -> Any:
    """Valeur enregistrable en JSON (dates et décimaux en texte)."""
    if valeur is None:
        return None
    return json.loads(json.dumps(valeur, default=str, ensure_ascii=False))


def journaliser(jeu, type: str, action: str, resume: str, *, request=None, auteur: Optional[str] = None,
                objet: Optional[tuple] = None, avant: Any = None, apres: Any = None) -> EvenementAudit:
    if type not in TYPES:
        raise ValueError(f"Type d'événement d'audit inconnu : {type}")
    compte = getattr(request, "user", None) if request is not None else None
    return EvenementAudit.objects.create(
        jeu=jeu, type=type, action=action[:100], resume=resume[:500],
        auteur=(auteur if auteur is not None else (auteur_de(request) if request is not None else ""))[:150],
        compte=(getattr(compte, "identifiant", "") or "")[:60],
        objet_type=str(objet[0]) if objet else "", objet_id=str(objet[1]) if objet else "",
        avant=_json(avant), apres=_json(apres))


def decision(jeu, type: str, action: str, resume: str, *, request, declencheur: str, objet: Optional[tuple] = None,
             avant: Any = None, apres: Any = None) -> EvenementAudit:
    """Décision qui change les effectifs : journalisée, et la version conservée de la planification devient obsolète."""
    from contextes.planification.services import marquer_obsolete
    evt = journaliser(jeu, type, action, resume, request=request, objet=objet, avant=avant, apres=apres)
    marquer_obsolete(jeu, declencheur)
    return evt


def vers_dict(e: EvenementAudit, detail: bool = False) -> dict:
    d = {"id": str(e.pk), "type": e.type, "action": e.action,
         "objet": {"type": e.objet_type, "id": e.objet_id} if e.objet_type else None,
         "resume": e.resume, "auteur": e.auteur or None, "compte": e.compte or None, "le": e.le}
    if detail:
        d.update(avant=e.avant, apres=e.apres)
    return d
