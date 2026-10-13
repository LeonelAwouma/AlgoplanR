"""Analyses dérivées d'un résultat : flux, invariants, candidatures, combinaisons, explication, recrues."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..commun.texte import cle_tri_fr, est_vide, norm
from ..donnees import colonnes as C
from .bareme import detail_bareme
from .rehydratation import enseignant_depuis_dict, poste_depuis_dict, poste_depuis_ecole_dict
from .score import detail_score, score_enseignant_poste

NIVEAUX_FLUX = {"region": ("region_origine", "region_poste"),
                "departement": ("departement_origine", "departement_poste"),
                "commune": ("commune_origine", "commune_poste")}


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
def verifier_invariants(res: Dict[str, Any]) -> List[dict]:
    aff, viv = res["affectations"], res["vivier"]
    ids = [a["id_ens"] for a in aff]
    postes = [a["id_poste"] for a in aff]
    ids_vivier = {v[C.COL_ENS_ID] for v in viv}
    s = res["synthese"]

    def inv(code, libelle, ok, details=""):
        return {"code": code, "libelle": libelle, "ok": bool(ok), "details": "" if ok else details}

    doublons_ens = sorted({i for i in ids if ids.count(i) > 1})
    doublons_postes = sorted({p for p in postes if postes.count(p) > 1})
    hors_vivier = sorted({i for i in ids if i not in ids_vivier})
    ss_ko = [a["id_ens"] for a in aff if a["phase"] not in ("effet_de_prince",)
             and norm(a.get("sous_systeme_ens")) and norm(a.get("sous_systeme_ens")) != norm(a.get("sous_systeme"))]
    ecoles_rouges = {e[C.COL_ETAB_ID] for e in res["etab_enrichi"] if e.get("est_zone_rouge")}
    rouge_ko = [a["id_ens"] for a in aff
                if a["phase"].startswith(("phase2", "phase3")) and a["id_etab"] in ecoles_rouges]
    n_prince_extra = sum(1 for a in aff if "_P_PRINCE_" in a["id_poste"])
    return [
        inv("ENS_UNIQUE", "Aucun enseignant affecté deux fois", not doublons_ens, f"Doublons : {doublons_ens}"),
        inv("POSTE_UNIQUE", "Aucun poste pourvu deux fois", not doublons_postes, f"Doublons : {doublons_postes}"),
        inv("DANS_VIVIER", "Tout enseignant affecté appartient au vivier", not hors_vivier, f"Hors vivier : {hors_vivier}"),
        inv("BILAN_VIVIER", "Affectés + non affectés = vivier", s["affectes"] + s["non_affectes"] == s["disponibles"],
            f"{s['affectes']} + {s['non_affectes']} != {s['disponibles']}"),
        inv("BILAN_POSTES", "Postes pourvus + non pourvus = besoin",
            len(aff) + s["postes_non_pourvus"] == s["besoin_total"],
            f"{len(aff)} + {s['postes_non_pourvus']} != {s['besoin_total']}"),
        inv("SOUS_SYSTEME", "Sous-système de l'enseignant compatible avec le poste (hors effet de prince)",
            not ss_ko, f"Incompatibles : {ss_ko}"),
        inv("ROUGE_PHASES", "Zone rouge exclue des phases de proximité", not rouge_ko,
            f"Affectés en zone rouge : {rouge_ko}"),
        inv("POSTES_SUPPLEMENTAIRES", "Postes créés hors besoin = faits de Prince",
            n_prince_extra <= s.get("effet_de_prince", 0), f"{n_prince_extra} poste(s) hors besoin"),
    ]


# ---------------------------------------------------------------------------
def candidatures(res: Dict[str, Any]) -> List[dict]:
    """Vœux des agents du vivier et leur issue (phase 1)."""
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
                        "bareme": v.get("bareme")})
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
