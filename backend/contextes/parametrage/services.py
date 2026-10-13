"""Cas d'usage du contexte Paramétrage."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict

from domaine.donnees import colonnes as C
from domaine.mobilite.bareme import categorie_situation, points_situation
from domaine.parametrage import config as cfg_dom

from .models import Parametres


def surcharges_jeu(jeu) -> Dict[str, Any]:
    p = Parametres.objects.filter(jeu=jeu).first()
    return p.regles if p else {}


def config_jeu(jeu) -> Dict[str, Any]:
    return cfg_dom.fusionner(cfg_dom.DEFAULT_CONFIG, surcharges_jeu(jeu))


def _enregistrer(jeu, regles: Dict[str, Any]) -> dict:
    cfg, avertissements = cfg_dom.valider(regles)       # lève ParametresInvalides -> 422
    Parametres.objects.update_or_create(jeu=jeu, defaults={"regles": regles})
    # Règle de recalcul : cache du diagnostic invalidé, scénarios marqués obsolètes.
    from contextes.diagnostic.services import invalider_cache
    from contextes.simulation.services import marquer_obsoletes
    invalider_cache(jeu)
    nb = marquer_obsoletes(jeu)
    return {"parametres": cfg, "surcharges": regles, "avertissements": avertissements, "scenarios_obsoletes": nb}


def remplacer(jeu, regles: Dict[str, Any]) -> dict:
    return _enregistrer(jeu, regles)


def fusionner_avec_existant(jeu, regles: Dict[str, Any]) -> dict:
    cfg_dom.valider(regles)
    courant = surcharges_jeu(jeu)
    nouveau = cfg_dom.fusionner(cfg_dom.fusionner(cfg_dom.DEFAULT_CONFIG, courant), regles)
    return _enregistrer(jeu, nouveau)


def inventaire_situations(jeu) -> dict:
    from contextes.donnees.models import Enseignant
    cfg = config_jeu(jeu)
    compte = Counter(Enseignant.objects.filter(jeu=jeu).values_list("situation", flat=True))
    lignes = [{"valeur": v or "(vide)", "effectif": n, "categorie": categorie_situation(v),
               "points": points_situation(v, cfg)} for v, n in sorted(compte.items(), key=lambda x: -x[1])]
    return {"total": sum(compte.values()), "situations": lignes,
            "points_configures": cfg["points_situation_familiale"]}
