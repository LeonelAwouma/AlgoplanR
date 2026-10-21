"""Périmètre territorial : filtre (_compute_filtered_data), arbre région > département > commune, options."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..commun.texte import cle_tri_fr, norm
from ..donnees import colonnes as C


@dataclass(frozen=True)
class Perimetre:
    region: str = ""
    departement: str = ""
    commune: str = ""

    @property
    def national(self) -> bool:
        return not (self.region or self.departement or self.commune)

    @property
    def niveau(self) -> str:
        if self.commune:
            return "commune"
        if self.departement:
            return "departement"
        if self.region:
            return "region"
        return "national"

    @property
    def titre(self) -> str:
        if self.national:
            return "National"
        return " > ".join(x for x in (self.region, self.departement, self.commune) if x)

    def vers_dict(self) -> dict:
        return {"region": self.region, "departement": self.departement, "commune": self.commune,
                "niveau": self.niveau, "titre": self.titre}


def filtrer_lignes(lignes: List[dict], p: Perimetre, col_region: str, col_dept: str, col_commune: str) -> List[dict]:
    if p.national:
        return lignes
    res = []
    for l in lignes:
        if p.region and norm(l.get(col_region)) != norm(p.region):
            continue
        if p.departement and norm(l.get(col_dept)) != norm(p.departement):
            continue
        if p.commune and norm(l.get(col_commune)) != norm(p.commune):
            continue
        res.append(l)
    return res


def _compter(lignes: List[dict], cle: str) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for l in lignes:
        v = l.get(cle)
        if v is not None:
            out[str(v)] = out.get(str(v), 0) + 1
    return out


def restreindre_resultat(res: Dict[str, Any], p: Perimetre) -> Dict[str, Any]:
    """Restreint un résultat de simulation à un périmètre (restreindreResultat)."""
    sortie = dict(res)
    synthese = dict(res["synthese"])
    if p.national:
        synthese["scope_title"] = "National"
        sortie["synthese"] = synthese
        sortie["perimetre"] = p.vers_dict()
        return sortie

    geo_etab = (C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)
    etab = filtrer_lignes(res["etab_enrichi"], p, *geo_etab)
    besoin = filtrer_lignes(res["ecoles_en_besoin"], p, *geo_etab)
    non_pourvus = filtrer_lignes(res["postes_non_pourvus"], p, *geo_etab)
    rouge = filtrer_lignes(res["postes_rouge_non_pourvus"], p, *geo_etab)
    aff = filtrer_lignes(res["affectations"], p, "region_poste", "departement_poste", "commune_poste")
    geo_att = ("region_attache", "departement_attache", "commune_attache")
    vivier = filtrer_lignes(res["vivier"], p, *geo_att)
    non_aff = filtrer_lignes(res["non_affectes"], p, *geo_att)

    # Les mouvements du Prince ne pourvoient aucun poste ouvert : ils sont comptés à part.
    ordinaires = [a for a in aff if a.get("phase") != "effet_de_prince"]
    if besoin:
        nb_besoin = int(sum(int(l.get("nb_postes_ouverts", 0) or 0) for l in besoin))
    else:
        nb_besoin = len(non_pourvus) + len(ordinaires)
    rt: Dict[str, int] = {}
    for l in non_pourvus:
        ss = l.get(C.COL_ETAB_SS)
        if ss is not None:
            rt[str(ss)] = rt.get(str(ss), 0) + 1
    ids = {l[C.COL_ETAB_ID] for l in etab}
    synthese.update({
        "besoin_total": nb_besoin, "disponibles": len(vivier), "affectes": len(ordinaires), "affectes_total": len(aff),
        "effet_de_prince": len(aff) - len(ordinaires),
        "non_affectes": len(non_aff), "postes_non_pourvus": len(non_pourvus), "a_recruter": len(non_pourvus),
        "rt_par_sous_systeme": rt, "postes_rouge_non_pourvus": len(rouge),
        "stats_phase": _compter(aff, "phase"), "scope_title": p.titre,
    })
    sortie.update({
        "synthese": synthese, "etab_enrichi": etab, "ecoles_en_besoin": besoin, "postes_non_pourvus": non_pourvus,
        "postes_rouge_non_pourvus": rouge, "affectations": aff, "vivier": vivier, "non_affectes": non_aff,
        "projections_n3": [l for l in res["projections_n3"] if l.get("Identifiant_Ecole") in ids],
        "ecoles_fournisseurs": [l for l in res["ecoles_fournisseurs"] if l.get(C.COL_ETAB_ID) in ids],
        "perimetre": p.vers_dict(),
    })
    return sortie


# ---------------------------------------------------------------------------
# Arbre territorial
# ---------------------------------------------------------------------------

def _agreger(ecoles: List[dict]) -> dict:
    return {
        "nb_ecoles": len(ecoles),
        "besoin": int(sum(int(e.get("nb_postes_ouverts", 0) or 0) for e in ecoles)),
        "excedent": int(sum(float(e.get("xe", 0) or 0) for e in ecoles)),
        "nb_necessiteuses": sum(1 for e in ecoles if e.get("est_necessiteuse")),
        "nb_excedentaires": sum(1 for e in ecoles if e.get("est_excedentaire")),
        "nb_zone_rouge": sum(1 for e in ecoles if e.get("est_zone_rouge")),
        "salles_manquantes": int(sum(float(e.get("se", 0) or 0) for e in ecoles)),
        "enseignants": int(sum(float(e.get(C.COL_ETAB_EE, 0) or 0) for e in ecoles)),
    }


def options_filtres(ecoles: List[dict], p: Perimetre) -> dict:
    """Valeurs des menus déroulants en cascade (région > département > commune > IAEB)."""
    def uniques(lignes, cle):
        vus: Dict[str, str] = {}
        for l in lignes:
            v = str(l.get(cle) or "").strip()
            if v and norm(v) not in vus:
                vus[norm(v)] = v
        return sorted(vus.values(), key=cle_tri_fr)

    dans_region = filtrer_lignes(ecoles, Perimetre(p.region), C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)
    dans_dept = filtrer_lignes(ecoles, Perimetre(p.region, p.departement), C.COL_ETAB_REGION, C.COL_ETAB_DEPT,
                               C.COL_ETAB_COMMUNE)
    return {
        "regions": uniques(ecoles, C.COL_ETAB_REGION),
        "departements": uniques(dans_region, C.COL_ETAB_DEPT) if p.region else uniques(ecoles, C.COL_ETAB_DEPT),
        "communes": uniques(dans_dept, C.COL_ETAB_COMMUNE) if (p.region or p.departement)
        else uniques(ecoles, C.COL_ETAB_COMMUNE),
        "sous_systemes": uniques(ecoles, C.COL_ETAB_SS),
        "zones": uniques(ecoles, C.COL_ETAB_ALPHA),
        "securites": uniques(ecoles, C.COL_ETAB_SIGMA),
        "types": uniques(ecoles, "type_etab"),
    }


def noeud_territorial(ecoles: List[dict], p: Perimetre) -> dict:
    """Nœud courant + enfants + fil d'Ariane + niveau (construireArbreTerritorial / trouverNoeud)."""
    courantes = filtrer_lignes(ecoles, p, C.COL_ETAB_REGION, C.COL_ETAB_DEPT, C.COL_ETAB_COMMUNE)
    fil = [{"niveau": "national", "libelle": "National", "perimetre": {}}]
    if p.region:
        fil.append({"niveau": "region", "libelle": p.region, "perimetre": {"region": p.region}})
    if p.departement:
        fil.append({"niveau": "departement", "libelle": p.departement,
                    "perimetre": {"region": p.region, "departement": p.departement}})
    if p.commune:
        fil.append({"niveau": "commune", "libelle": p.commune,
                    "perimetre": {"region": p.region, "departement": p.departement, "commune": p.commune}})

    cle_enfant = {"national": (C.COL_ETAB_REGION, "region"), "region": (C.COL_ETAB_DEPT, "departement"),
                  "departement": (C.COL_ETAB_COMMUNE, "commune")}.get(p.niveau)
    enfants = []
    if cle_enfant:
        col, niveau = cle_enfant
        groupes: Dict[str, List[dict]] = {}
        noms: Dict[str, str] = {}
        for e in courantes:
            v = str(e.get(col) or "").strip()
            groupes.setdefault(norm(v), []).append(e)
            noms.setdefault(norm(v), v)
        for k in sorted(groupes, key=lambda k: cle_tri_fr(noms[k])):
            ref = {"region": p.region, "departement": p.departement, "commune": p.commune}
            ref[niveau] = noms[k]
            enfants.append({"niveau": niveau, "libelle": noms[k] or "(non renseigné)", "perimetre": ref,
                            **_agreger(groupes[k])})
    return {
        "niveau": p.niveau, "libelle": p.titre, "perimetre": p.vers_dict(), "fil_ariane": fil,
        "noeud": _agreger(courantes), "enfants": enfants,
        "ecoles": [e[C.COL_ETAB_ID] for e in courantes] if p.niveau == "commune" else [],
    }
