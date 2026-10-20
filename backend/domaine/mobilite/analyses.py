"""Analyses dérivées d'un résultat : flux, invariants, candidatures, combinaisons, explication, recrues."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..acces.regions import cle_region
from ..commun.texte import cle_tri_fr, est_vide, norm
from ..donnees import colonnes as C
from .bareme import detail_bareme
from .rehydratation import enseignant_depuis_dict, poste_depuis_dict, poste_depuis_ecole_dict
from .score import detail_score, score_enseignant_poste

NIVEAUX_FLUX = {"region": ("region_origine", "region_poste"),
                "departement": ("departement_origine", "departement_poste"),
                "commune": ("commune_origine", "commune_poste")}


#: Phases dont la décision est humaine : elles peuvent traverser les régions.
PHASES_DECISION = ("effet_de_prince", "arbitrage_commission")


# ---------------------------------------------------------------------------
def calculer_flux(affectations: List[dict], niveau: str = "region") -> List[dict]:
    """Flux entre territoires : reçus, sortants, internes, solde (calculerFlux)."""
    if niveau not in NIVEAUX_FLUX:
        raise ValueError("niveau doit valoir region, departement ou commune")
    col_o, col_d = NIVEAUX_FLUX[niveau]
    t: Dict[str, Dict[str, int]] = {}
    noms: Dict[str, str] = {}

    def ligne(v: str) -> Dict[str, int]:
        k = norm(v)
        noms.setdefault(k, str(v or "").strip())
        return t.setdefault(k, {"recus": 0, "sortants": 0, "internes": 0})

    for a in affectations:
        o, d = a.get(col_o) or "", a.get(col_d) or ""
        if norm(o) == norm(d):
            ligne(d)["internes"] += 1
        else:
            ligne(d)["recus"] += 1
            ligne(o)["sortants"] += 1
    out = [{"territoire": noms[k] or "(non renseigné)", "niveau": niveau, **v, "solde": v["recus"] - v["sortants"]}
           for k, v in t.items()]
    return sorted(out, key=lambda l: cle_tri_fr(l["territoire"]))


# ---------------------------------------------------------------------------
def _ratio(num: float, den: float, chiffres: int) -> float:
    return round(num / den, chiffres) if den else 0.0


def comparer_encadrement_turnover(res: Dict[str, Any], enseignants: List[Any], cfg: dict) -> dict:
    """Taux d'encadrement (élèves par enseignant) et turnover, avant l'algorithme (fichier d'origine) et après.

    - Encadrement : avant = élèves ÷ `Enseignants_Actuels` (déjà mis à jour des faits du Prince, appliqués avant
      l'algorithme) ; après, l'effectif de chaque école gagne ses arrivées et perd ses départs ordinaires (une
      affectation part de l'école d'attache de l'enseignant).
    - Turnover : le fichier n'a pas d'historique de départs ; est « récent » un enseignant dont l'ancienneté au
      poste est sous le seuil de recevabilité. Avant = récents ÷ effectif ; après = (récents + déplacés) ÷ effectif,
      car un enseignant déplacé repart à zéro dans son nouveau poste (le vivier n'en contient jamais de récents).
    `enseignants` : tous les enseignants du jeu (le résultat ne contient que le vivier).
    """
    seuil = float(cfg["seuils"]["anciennete_poste_recevabilite_ans"])
    ecoles = {e[C.COL_ETAB_ID]: e for e in res["etab_enrichi"]}
    origine = {v[C.COL_ENS_ID]: v.get(C.COL_ENS_ETAB) for v in res["vivier"]}

    def region_de(id_ecole: Any) -> str:
        return str((ecoles.get(id_ecole) or {}).get(C.COL_ETAB_REGION) or "")

    def nouveau() -> dict:
        return {"eleves": 0.0, "enseignants_avant": 0.0, "enseignants_apres": 0.0, "effectif": 0, "recents": 0,
                "deplaces": 0, "effectif_apres": 0}

    regions: Dict[str, dict] = {}
    national = nouveau()

    def cumuler(region: str, cle: str, valeur: float) -> None:
        national[cle] += valeur
        regions.setdefault(region, nouveau())[cle] += valeur

    for e in ecoles.values():
        r = region_de(e[C.COL_ETAB_ID])
        cumuler(r, "eleves", float(e.get(C.COL_ETAB_NE) or 0))
        cumuler(r, "enseignants_avant", float(e.get(C.COL_ETAB_EE) or 0))
        cumuler(r, "enseignants_apres", float(e.get(C.COL_ETAB_EE) or 0))
    for a in res["affectations"]:
        cumuler(region_de(a["id_etab"]), "deplaces", 1)
        if a["phase"] == "effet_de_prince":
            continue          # déjà dans l'effectif des écoles : les bases sont recalculées avant l'algorithme
        depart = origine.get(a["id_ens"])
        cumuler(region_de(a["id_etab"]), "enseignants_apres", 1)
        if depart in ecoles:
            cumuler(region_de(depart), "enseignants_apres", -1)
    for t in enseignants:
        r = region_de(t.ecole_attache)
        cumuler(r, "effectif", 1)
        cumuler(r, "effectif_apres", 1)
        if float(t.anciennete_poste or 0) < seuil:
            cumuler(r, "recents", 1)
    for a in res["affectations"]:
        if a["phase"] == "effet_de_prince":
            continue          # l'enseignant est déjà rattaché à sa destination dans `enseignants`
        depart = origine.get(a["id_ens"])
        if depart in ecoles:
            cumuler(region_de(depart), "effectif_apres", -1)
        cumuler(region_de(a["id_etab"]), "effectif_apres", 1)

    def finir(brut: dict, nom: str) -> dict:
        return {
            "territoire": nom,
            "eleves": int(brut["eleves"]),
            "enseignants_avant": int(brut["enseignants_avant"]), "enseignants_apres": int(brut["enseignants_apres"]),
            "rem_avant": _ratio(brut["eleves"], brut["enseignants_avant"], 2),
            "rem_apres": _ratio(brut["eleves"], brut["enseignants_apres"], 2),
            "effectif": int(brut["effectif"]), "recents": int(brut["recents"]), "deplaces": int(brut["deplaces"]),
            "turnover_avant": _ratio(brut["recents"], brut["effectif"], 4),
            "turnover_apres": _ratio(brut["recents"] + brut["deplaces"], brut["effectif_apres"], 4),
        }

    return {"seuil_anciennete_ans": seuil, "national": finir(national, "National"),
            "par_region": [finir(b, r or "(région non renseignée)")
                           for r, b in sorted(regions.items(), key=lambda kv: cle_tri_fr(kv[0]))]}


# ---------------------------------------------------------------------------
def verifier_invariants(res: Dict[str, Any]) -> List[dict]:
    aff, viv = res["affectations"], res["vivier"]
    ids = [a["id_ens"] for a in aff]
    postes = [a["id_poste"] for a in aff]
    ids_vivier = {v[C.COL_ENS_ID] for v in viv}
    s = res["synthese"]
    # Les faits du Prince sont appliqués aux bases avant l'algorithme : ces agents ne sont plus dans le vivier et leur
    # mouvement ne pourvoit aucun poste ouvert. Les bilans portent donc sur les affectations ordinaires.
    ordinaires = [a for a in aff if a["phase"] != "effet_de_prince"]

    def inv(code, libelle, ok, details=""):
        return {"code": code, "libelle": libelle, "ok": bool(ok), "details": "" if ok else details}

    doublons_ens = sorted({i for i in ids if ids.count(i) > 1})
    doublons_postes = sorted({p for p in postes if postes.count(p) > 1})
    hors_vivier = sorted({a["id_ens"] for a in ordinaires if a["id_ens"] not in ids_vivier})
    ss_ko = [a["id_ens"] for a in aff if a["phase"] not in ("effet_de_prince",)
             and norm(a.get("sous_systeme_ens")) and norm(a.get("sous_systeme_ens")) != norm(a.get("sous_systeme"))]
    ecoles_rouges = {e[C.COL_ETAB_ID] for e in res["etab_enrichi"] if e.get("est_zone_rouge")}
    rouge_ko = [a["id_ens"] for a in aff
                if a["phase"].startswith(("phase2", "phase3")) and a["id_etab"] in ecoles_rouges]
    region_ko = [a["id_ens"] for a in aff if s.get("regions_etanches") and a["phase"] not in PHASES_DECISION
                 and cle_region(a.get("region_poste")) != cle_region(a.get("region_origine"))]
    n_prince_extra = sum(1 for a in ordinaires if "_P_PRINCE_" in a["id_poste"])
    return [
        inv("ENS_UNIQUE", "Aucun enseignant affecté deux fois", not doublons_ens, f"Doublons : {doublons_ens}"),
        inv("POSTE_UNIQUE", "Aucun poste pourvu deux fois", not doublons_postes, f"Doublons : {doublons_postes}"),
        inv("DANS_VIVIER", "Tout enseignant affecté appartient au vivier", not hors_vivier, f"Hors vivier : {hors_vivier}"),
        inv("BILAN_VIVIER", "Affectés + non affectés = vivier", s["affectes"] + s["non_affectes"] == s["disponibles"],
            f"{s['affectes']} + {s['non_affectes']} != {s['disponibles']}"),
        inv("BILAN_POSTES", "Postes pourvus + non pourvus = besoin",
            len(ordinaires) + s["postes_non_pourvus"] == s["besoin_total"],
            f"{len(ordinaires)} + {s['postes_non_pourvus']} != {s['besoin_total']}"),
        inv("SOUS_SYSTEME", "Sous-système de l'enseignant compatible avec le poste (hors effet de prince)",
            not ss_ko, f"Incompatibles : {ss_ko}"),
        inv("ROUGE_PHASES", "Zone rouge exclue des phases de proximité", not rouge_ko,
            f"Affectés en zone rouge : {rouge_ko}"),
        inv("REGION", "Affectation dans la région de l'enseignant (hors décisions du prince et de la commission)",
            not region_ko, f"Affectés hors région : {region_ko}"),
        inv("POSTES_SUPPLEMENTAIRES", "Aucun poste créé hors besoin : les faits du Prince ne consomment pas de poste",
            n_prince_extra == 0, f"{n_prince_extra} poste(s) hors besoin"),
    ]


# ---------------------------------------------------------------------------
def _score_voeu(viv: Dict[str, Any], ecole: Optional[Dict[str, Any]], cfg: Optional[dict]) -> Optional[dict]:
    """Score d'appariement complet (Z1 à Z4) de l'agent contre un poste de l'école visée ; None sans poste ouvert."""
    if cfg is None or ecole is None or int(ecole.get("nb_postes_ouverts", 0) or 0) == 0:
        return None
    poste = poste_depuis_ecole_dict(ecole, f"{ecole[C.COL_ETAB_ID]}_voeu")
    poste.Up = float(ecole.get("Up", 0) or 0)
    poste.Wp = float(ecole.get("Wp", 0) or 0)
    poste.est_zone_rouge = bool(ecole.get("est_zone_rouge"))
    detail = detail_score(enseignant_depuis_dict(viv), poste, cfg)
    z = {c["code"]: c["valeur"] for c in detail["composantes"]}
    return {"total": detail["total"], "composantes": z,
            "ajustements_contextuels": next(c["contribution"] for c in detail["composantes"]
                                            if c["code"] == "Z4_ajustements")}


def candidatures(res: Dict[str, Any], cfg: Optional[dict] = None) -> List[dict]:
    """Vœux des agents du vivier et leur issue (phase 1).

    Avec `cfg`, chaque vœu porte son score d'appariement complet (`detail_score`) : barème, poids du poste,
    proximité et ajustements contextuels, calculés contre un poste de l'école visée (None si aucun poste ouvert).
    """
    ecoles = {e[C.COL_ETAB_ID]: e for e in res["etab_enrichi"]}
    p1 = {a["id_ens"]: a for a in res["affectations"] if a["phase"].startswith("phase1")}
    out = []
    for v in res["vivier"]:
        mat = v[C.COL_ENS_ID]
        for num, col in enumerate((C.COL_ENS_V1, C.COL_ENS_V2, C.COL_ENS_V3), 1):
            voeu = (v.get(col) or "").strip()
            if est_vide(voeu):
                continue
            ec = ecoles.get(voeu)
            if mat in p1 and p1[mat]["id_etab"] == voeu:
                statut, motif = "SATISFAIT", "Vœu satisfait en phase 1"
            elif ec is None:
                statut, motif = "ECOLE_INCONNUE", "École absente du référentiel"
            elif int(ec.get("nb_postes_ouverts", 0) or 0) == 0:
                statut, motif = "AUCUN_POSTE", "L'école n'a aucun poste ouvert"
            elif norm(v.get(C.COL_ENS_SS)) and norm(v.get(C.COL_ENS_SS)) != norm(ec.get(C.COL_ETAB_SS)):
                statut, motif = "INCOMPATIBLE", "Sous-système différent"
            elif mat in p1:
                statut, motif = "NON_RETENU", "Un vœu de meilleur rang a été satisfait"
            else:
                statut, motif = "NON_RETENU", "Postes pourvus par des candidats mieux classés"
            out.append({"id_ens": mat, "rang_voeu": num, "id_etab": voeu, "statut": statut, "motif": motif,
                        "bareme": v.get("bareme"), "detail_score": _score_voeu(v, ec, cfg)})
    return out


# ---------------------------------------------------------------------------
def combinaisons(res: Dict[str, Any], cfg: dict, max_options: int = 3, limite: Optional[int] = None) -> List[dict]:
    """Pour chaque non-affecté, les meilleurs postes encore vacants (options soumises aux commissions)."""
    postes = [poste_depuis_dict(p) for p in res["postes_non_pourvus"]]
    out = []
    for v in res["non_affectes"][:limite]:
        e = enseignant_depuis_dict(v)
        ss = norm(e.sous_systeme)
        opts = []
        for p in postes:
            if ss and norm(p.sous_systeme) != ss:
                continue
            opts.append({"id_poste": p.id_poste, "id_etab": p.id_etab, "commune": p.commune,
                         "departement": p.departement, "zone_rouge": p.est_zone_rouge,
                         "score": score_enseignant_poste(e, p, cfg)})
        opts.sort(key=lambda o: -o["score"])
        out.append({"id_ens": e.matricule, "bareme": e.bareme, "options": opts[:max_options],
                    "nb_postes_compatibles": len(opts)})
    return out


# ---------------------------------------------------------------------------
def expliquer_proposition(res: Dict[str, Any], matricule: str, cfg: dict, nb_alternatives: int = 3) -> Optional[dict]:
    aff = next((a for a in res["affectations"] if a["id_ens"] == matricule), None)
    viv = next((v for v in res["vivier"] if v[C.COL_ENS_ID] == matricule), None)
    if aff is None or viv is None:
        return None
    e = enseignant_depuis_dict(viv)
    poste_d = next((p for p in res["postes_non_pourvus"] if p["id_poste"] == aff["id_poste"]), None)
    ecole_d = next((x for x in res["etab_enrichi"] if x[C.COL_ETAB_ID] == aff["id_etab"]), None)
    if ecole_d is None:
        return None
    # Le poste attribué n'est plus « non pourvu » : on le reconstruit depuis l'école.
    poste = poste_depuis_dict(poste_d) if poste_d else poste_depuis_ecole_dict(ecole_d, aff["id_poste"])
    if poste_d is None:
        poste.Up = float(ecole_d.get("Up", 0) or 0) if "_P_PRINCE_" not in aff["id_poste"] else 0.0
        poste.Wp = float(ecole_d.get("Wp", 0) or 0) if "_P_PRINCE_" not in aff["id_poste"] else 0.0
        poste.est_zone_rouge = bool(ecole_d.get("est_zone_rouge"))
    alternatives = []
    for pd_ in res["postes_non_pourvus"]:
        p = poste_depuis_dict(pd_)
        if norm(e.sous_systeme) and norm(p.sous_systeme) != norm(e.sous_systeme):
            continue
        alternatives.append({"id_poste": p.id_poste, "id_etab": p.id_etab,
                             "score": score_enseignant_poste(e, p, cfg)})
    alternatives.sort(key=lambda o: -o["score"])
    libelles = {
        "effet_de_prince": "Décision de l'autorité (phase 0) : le barème et le score sont indicatifs.",
        "phase1_voeu_1": "Vœu n°1 satisfait : meilleur score parmi les candidats à ce poste.",
        "phase1_voeu_2": "Vœu n°2 satisfait : meilleur score parmi les candidats à ce poste.",
        "phase1_voeu_3": "Vœu n°3 satisfait : meilleur score parmi les candidats à ce poste.",
        "phase2_proximite_iaeb": "Poste le mieux classé dans la même circonscription IAEB.",
        "phase2_proximite_departement": "Poste le mieux classé dans le même département.",
        "phase3_extension_regionale": "Poste le mieux classé après extension à toutes les zones hors rouge.",
        "arbitrage_commission": "Décision de commission d'arbitrage.",
    }
    return {
        "id_ens": matricule, "phase": aff["phase"], "explication": libelles.get(aff["phase"], aff["phase"]),
        "motif": aff.get("motif_derogation", ""), "poste": aff["id_poste"], "id_etab": aff["id_etab"],
        "bareme": detail_bareme(e, cfg), "score": detail_score(e, poste, cfg),
        "alternatives_vacantes": alternatives[:nb_alternatives],
    }


# ---------------------------------------------------------------------------
def tableau_explicatif_scores(res: Dict[str, Any], cfg: dict) -> List[dict]:
    """Une ligne par affectation, pour le rapport : de quoi est fait le score final.

    Barème individuel (Z1), poids du poste (Z2), proximité (Z3) et ajustements contextuels (Z4), avec leurs poids
    et leur contribution au score. Même source que `expliquer_proposition` (`detail_score`) ; les affectations sans
    agent dans le vivier (décisions de l'autorité) sont omises.
    """
    vivier = {v[C.COL_ENS_ID]: v for v in res["vivier"]}
    postes = {p["id_poste"]: p for p in res["postes_non_pourvus"]}
    ecoles = {x[C.COL_ETAB_ID]: x for x in res["etab_enrichi"]}
    lignes = []
    for aff in res["affectations"]:
        viv, ecole_d = vivier.get(aff["id_ens"]), ecoles.get(aff["id_etab"])
        if viv is None or ecole_d is None:
            continue
        if aff["id_poste"] in postes:
            poste = poste_depuis_dict(postes[aff["id_poste"]])
        else:
            poste = poste_depuis_ecole_dict(ecole_d, aff["id_poste"])
            virtuel = "_P_PRINCE_" in aff["id_poste"]
            poste.Up = 0.0 if virtuel else float(ecole_d.get("Up", 0) or 0)
            poste.Wp = 0.0 if virtuel else float(ecole_d.get("Wp", 0) or 0)
            poste.est_zone_rouge = bool(ecole_d.get("est_zone_rouge"))
        detail = detail_score(enseignant_depuis_dict(viv), poste, cfg)
        z = {c["code"]: c for c in detail["composantes"]}
        lignes.append({
            "id_ens": aff["id_ens"], "id_poste": aff["id_poste"], "id_etab": aff["id_etab"], "phase": aff["phase"],
            "bareme_individuel": z["Z1_bareme_individu"]["valeur"],
            "poids_poste": z["Z2_poids_poste_Up"]["valeur"],
            "proximite": z["Z3_proximite"]["valeur"],
            "ajustements_contextuels": z["Z4_ajustements"]["valeur"],
            "contributions": {k: c["contribution"] for k, c in z.items()},
            "poids": {k: c["poids"] for k, c in z.items()},
            "score_final": detail["total"],
        })
    return lignes


def deployer_recrues(recrues: List[dict], postes_non_pourvus: List[dict]) -> dict:
    """Affecte les recrues aux postes vacants : même sous-système, région souhaitée en priorité, poids Up décroissant.

    Règle proposée (absente du moteur d'origine) — à valider avec le métier.
    """
    libres = sorted(postes_non_pourvus, key=lambda p: -float(p.get("Up", 0) or 0))
    deploiements, sans_poste = [], []
    for r in sorted(recrues, key=lambda r: (r.get("rang") is None, r.get("rang") or 0, r["id_recrue"])):
        ss, reg = norm(r.get("sous_systeme")), norm(r.get("region_souhaitee"))
        choix = None
        for pref in (True, False):
            for p in libres:
                if ss and norm(p.get(C.COL_ETAB_SS)) != ss:
                    continue
                if pref and (not reg or norm(p.get(C.COL_ETAB_REGION)) != reg):
                    continue
                choix = p
                break
            if choix:
                break
        if choix is None:
            sans_poste.append(r["id_recrue"])
            continue
        libres.remove(choix)
        deploiements.append({"id_recrue": r["id_recrue"], "nom": r.get("nom", ""), "prenom": r.get("prenom", ""),
                             "id_poste": choix["id_poste"], "id_etab": choix[C.COL_ETAB_ID],
                             "region": choix.get(C.COL_ETAB_REGION), "departement": choix.get(C.COL_ETAB_DEPT),
                             "commune": choix.get(C.COL_ETAB_COMMUNE), "sous_systeme": choix.get(C.COL_ETAB_SS)})
    return {"deploiements": deploiements, "recrues_sans_poste": sans_poste, "postes_restants": len(libres)}


def analyser_recrues(lignes: List[dict]) -> dict:
    acceptees, refusees, vus = [], [], set()
    for n, l in enumerate(lignes, 1):
        ident = str(l.get("id_recrue") or l.get("Identifiant_Recrue") or "").strip()
        if not ident:
            refusees.append({"ligne": n, "motif": "Identifiant de recrue manquant"})
        elif ident in vus:
            refusees.append({"ligne": n, "id_recrue": ident, "motif": "Doublon dans le fichier"})
        else:
            vus.add(ident)
            rang = l.get("rang")
            try:
                rang = int(float(rang)) if rang not in (None, "") else None
            except (TypeError, ValueError):
                rang = None
            acceptees.append({"id_recrue": ident, "nom": str(l.get("nom") or "").strip(),
                              "prenom": str(l.get("prenom") or "").strip(),
                              "sous_systeme": str(l.get("sous_systeme") or l.get("Sous_Systeme") or "").strip(),
                              "region_souhaitee": str(l.get("region_souhaitee") or l.get("Region") or "").strip(),
                              "rang": rang})
    return {"acceptees": acceptees, "refusees": refusees}
