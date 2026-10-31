"""Comparaison reproductible du moteur (méthode du minimum pédagogique commun) sur deux classeurs Excel.

    cd backend
    python outils/comparer_minimum_commun.py etablissements_national.xlsx enseignants_national.xlsx \
        [--minimum 3] [--norme 60] [--tolerance 20] [--ecarts 20] [--json sortie.json]

Le script ne code aucun résultat : il lit les deux fichiers, applique le moteur (diagnostic, éligibilité individuelle,
vivier, affectations) avec les trois paramètres demandés et imprime les indicateurs de la mission :

    écoles, enseignants, besoin théorique total, écoles déficitaires / excédentaires, excédent théorique,
    enseignants individuellement éligibles (âge valide, ancienneté au poste suffisante), enseignants retenus dans le
    vivier, affectations proposées.

Pour expliquer un écart avec une référence historique, il calcule aussi, école par école, le besoin de l'ancienne
règle multigrade (minimum 6, ou 3 pour une école déclarée multigrade) et classe les écoles qui diffèrent.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE))

from contextes.donnees.lecteur import lire_classeur  # noqa: E402
from domaine.diagnostic.indicateurs import enrichir_ecoles  # noqa: E402
from domaine.donnees import correspondance as corr  # noqa: E402
from domaine.donnees.modeles import construire_ecole, construire_enseignant  # noqa: E402
from domaine.mobilite.moteur import lancer_affectation  # noqa: E402
from domaine.mobilite.vivier import construire_vivier, nettoyer_enseignants  # noqa: E402
from domaine.parametrage.config import defaut  # noqa: E402


def lire(chemin: Path, type_fichier: str) -> list:
    _, _, entetes, lignes = lire_classeur(chemin.read_bytes(), chemin.name)
    c = corr.detecter(type_fichier, entetes)
    manquantes = [a["colonne"] for a in c["a_confirmer"] if a["obligatoire"]]
    if manquantes:
        raise SystemExit(f"{chemin.name} : colonnes obligatoires introuvables : {manquantes}")
    return corr.appliquer(lignes, c["correspondance"])


def _a_une_classe_multigrade(valeur) -> bool:
    v = str(valeur or "").strip().lower()
    if v in ("oui", "yes", "true", "vrai", "y", "o"):
        return True
    try:
        return float(v) > 0
    except ValueError:
        return False


def besoin_ancienne_regle(ecole, cfg) -> int:
    """Ancienne règle de l'interface sombre : D = max(P ; m), m = 6 niveaux, ou 3 si l'école est multigrade."""
    pe = ecole.ind.Pe
    m = 3 if _a_une_classe_multigrade(ecole.multigrade) else 6
    return max(pe, m)


def comparer(fichier_ecoles: Path, fichier_enseignants: Path, minimum: int, norme: float, tolerance: float,
             nb_ecarts: int) -> dict:
    cfg = defaut()
    cfg["besoin"].update({"plancher_pedagogique": minimum, "norme_eleves_par_maitre": norme,
                          "effectif_premiere_section": tolerance})
    ecoles = [construire_ecole(l) for l in lire(fichier_ecoles, "etablissements")]
    enseignants = [construire_enseignant(l) for l in lire(fichier_enseignants, "enseignants")]

    enrichies = enrichir_ecoles(list(ecoles), cfg)
    gardes, exclus_age = nettoyer_enseignants(enseignants, cfg)
    seuil = int(cfg["seuils"]["anciennete_poste_recevabilite_ans"])
    eligibles = [e for e in gardes if float(e.anciennete_poste or 0) >= seuil]
    vivier = construire_vivier(list(enseignants), enrichies, cfg, exclus=None)
    res = lancer_affectation(ecoles, enseignants, cfg)

    ecarts = []
    for e in enrichies:
        ancien = besoin_ancienne_regle(e, cfg)
        if ancien != e.ind.De:
            ecarts.append({"id": e.id, "eleves": e.effectif_eleves, "enseignants": e.enseignants_actuels,
                           "multigrade": str(e.multigrade), "besoin_nouveau": e.ind.De, "besoin_ancienne_regle": ancien})
    ecarts.sort(key=lambda x: -abs(x["besoin_ancienne_regle"] - x["besoin_nouveau"]))
    return {
        "parametres": {"minimum_M": minimum, "norme_R": norme, "tolerance_T": tolerance},
        "ecoles": len(enrichies),
        "enseignants": len(enseignants),
        "besoin_theorique_total": int(sum(e.ind.De for e in enrichies)),
        "ecoles_deficitaires": sum(1 for e in enrichies if e.ind.be > 0),
        "ecoles_excedentaires": sum(1 for e in enrichies if e.ind.xe > 0),
        "excedent_theorique_total": int(sum(e.ind.xe for e in enrichies)),
        "excedent_mobilisable_total": int(sum(e.ind.xe_sur for e in enrichies)),
        "ecoles_effectif_inconnu": sum(1 for e in enrichies if not e.effectif_connu),
        "enseignants_exclus_age_invalide_ou_retraite": len(exclus_age),
        "enseignants_individuellement_eligibles": len(eligibles),
        "enseignants_retenus_vivier_excedents": len(vivier),
        "vivier_apres_moteur": len(res.vivier),
        "affectations_proposees": len(res.affectations),
        "ecarts_de_besoin_avec_ancienne_regle_multigrade": {
            "ecoles_concernees": len(ecarts),
            "repartition": dict(Counter(f"{x['besoin_ancienne_regle']}->{x['besoin_nouveau']}" for x in ecarts)),
            "premieres": ecarts[:nb_ecarts],
        },
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("etablissements", type=Path)
    p.add_argument("enseignants", type=Path)
    p.add_argument("--minimum", type=int, default=3)
    p.add_argument("--norme", type=float, default=60)
    p.add_argument("--tolerance", type=float, default=20)
    p.add_argument("--ecarts", type=int, default=20)
    p.add_argument("--json", type=Path)
    a = p.parse_args()
    for f in (a.etablissements, a.enseignants):
        if not f.exists():
            raise SystemExit(f"Fichier introuvable : {f}")
    r = comparer(a.etablissements, a.enseignants, a.minimum, a.norme, a.tolerance, a.ecarts)
    sortie = json.dumps(r, ensure_ascii=False, indent=2)
    print(sortie)
    if a.json:
        a.json.write_text(sortie, encoding="utf-8")


if __name__ == "__main__":
    main()
