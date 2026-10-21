"""Cas d'usage du contexte Nominations : vivier consolidé, postes ouverts, cycle de vie, registre des mouvements.

Le vivier et les postes ouverts sont lus dans le résultat du scénario de référence (le scénario retenu, à défaut le
scénario par défaut du jeu) :
  - vivier : enseignants excédentaires restés sans affectation, lauréats que le déploiement des recrues n'a pas
    placés, personnes importées d'autres sources ; seules les sources retenues par les hypothèses comptent ;
  - postes ouverts : postes restés vacants, hors postes attribués aux recrues ;
  - registre : redéploiements et faits du Prince du scénario (ces derniers sont pré-validés, comme dans codeSource),
    déploiements des recrues, nominations validées ou mises en œuvre.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from django.db import transaction
from django.utils import timezone

from contextes.audit.services import journaliser
from contextes.commun.erreurs import RefusMetier
from contextes.simulation import services as sim
from domaine.commun.texte import norm, texte
from domaine.donnees import colonnes as C
from domaine.mobilite.analyses import deployer_recrues
from domaine.nominations import cycle
from domaine.nominations.rapprochement import classer, rapprocher, sous_systemes_compatibles
from domaine.planification.parametres import ANNEES_PLAN
from domaine.planification.projection import code_sous_systeme, lieu_de, lieu_ecole

from .models import Nomination, PersonneVivier, RealisationMouvement

LIBELLES_SOURCE = {"disponibilite": "Retour de disponibilité", "fin_detachement": "Fin de détachement",
                   "reintegration": "Réintégration", "autre": "Autre source",
                   "laureat_sans_poste": "Lauréat : première affectation"}


class Conflit(RefusMetier):
    """Double engagement ou décision définitive : 409."""
    statut = 409

    def __init__(self, message: str, motifs: Optional[List[str]] = None):
        super().__init__(message, motifs, code="conflit")


def scenario_reference(jeu):
    """Scénario dont les mouvements alimentent nominations et planification : le retenu, sinon celui par défaut."""
    return jeu.scenario_retenu or sim.scenario_par_defaut(jeu)


def _ss(valeur) -> Optional[str]:
    c = code_sous_systeme(valeur)
    return None if c == "non_renseigne" else c


def _zone_securite(valeur) -> Optional[str]:
    v = norm(valeur)
    for z in ("rouge", "jaune", "vert"):
        if z in v:
            return "verte" if z == "vert" else z
    return None


def public(d: dict) -> dict:
    """Sans les champs internes (préfixés par « _ »)."""
    return {k: v for k, v in d.items() if not k.startswith("_")}


@dataclass
class Registre:
    jeu: object
    scenario: object
    resultat: dict
    cfg: dict
    prep: object
    sources: set
    vivier: List[dict] = field(default_factory=list)
    vivier_par_id: Dict[str, dict] = field(default_factory=dict)
    postes: List[dict] = field(default_factory=list)
    postes_par_id: Dict[str, dict] = field(default_factory=dict)
    deploiements: dict = field(default_factory=dict)
    nominations: List[Nomination] = field(default_factory=list)
    statuts_personne: Dict[str, List[str]] = field(default_factory=dict)
    statuts_poste: Dict[str, List[str]] = field(default_factory=dict)

    def nom_ecole(self, ident: str) -> str:
        e = self.prep.ecoles_par_id.get(ident)
        return (e.nom or e.id) if e else ident

    def lieu(self, id_ecole: str, defaut: Optional[dict] = None) -> Optional[dict]:
        e = self.prep.ecoles_par_id.get(id_ecole)
        return lieu_de(e) if e else defaut

    def actualiser(self) -> None:
        """Disponibilité des personnes et statut des postes, d'après les nominations."""
        self.statuts_personne, self.statuts_poste = defaultdict(list), defaultdict(list)
        for n in self.nominations:
            self.statuts_personne[n.personne_id].append(n.statut)
            self.statuts_poste[n.poste_id].append(n.statut)
        for v in self.vivier:
            v["disponibilite"] = cycle.disponibilite(self.statuts_personne.get(v["id"], []))
        for p in self.postes:
            p["statut"] = cycle.statut_poste(self.statuts_poste.get(p["id"], []))
            visees = [n for n in self.nominations if n.poste_id == p["id"] and n.statut in cycle.ENGAGES]
            retenue = next((n for n in visees if n.statut != "proposee"), visees[0] if visees else None)
            p["nomination_id"] = str(retenue.pk) if retenue else None


def _excedentaire(d: dict, reg: "Registre") -> dict:
    mat = texte(d.get(C.COL_ENS_ID))
    ecole = texte(d.get(C.COL_ENS_ETAB))
    contraintes = []
    age = d.get(C.COL_ENS_AGE)
    if age is not None and float(age) >= reg.cfg["seuils"].get("age_retraite_ans", 60) - 5:
        contraintes.append("Proche de la retraite : protégé des transferts imposés")
    ss = _ss(d.get(C.COL_ENS_SS))
    if ss is None:
        contraintes.append("Sous-système non renseigné")
    return {"id": f"ens-{mat}", "matricule": mat, "nom": texte(d.get("nom")), "prenom": texte(d.get("prenom")),
            "source": "excedentaire", "sous_systeme": ss, "region": texte(d.get("region_attache")),
            "departement": texte(d.get("departement_attache")), "commune": texte(d.get("commune_attache")),
            "iaeb": texte(d.get("iaeb_attache")),
            "ecole_origine": {"id": ecole, "nom": reg.nom_ecole(ecole)} if ecole else None,
            "bareme": d.get("bareme"), "note": None, "disponibilite": "libre", "contraintes": contraintes, "_ens": d}


def _laureat(r: dict) -> dict:
    contraintes = ["Lauréat : première affectation"]
    if r.get("rang"):
        contraintes.append(f"Rang au concours : {r['rang']}")
    return {"id": f"laureat-{r['id_recrue']}", "matricule": None, "nom": r.get("nom", ""),
            "prenom": r.get("prenom", ""), "source": "laureat_sans_poste", "sous_systeme": _ss(r.get("sous_systeme")),
            "region": r.get("region_souhaitee", ""), "departement": "", "commune": "", "iaeb": "",
            "ecole_origine": None, "bareme": None, "note": None, "disponibilite": "libre",
            "contraintes": contraintes, "_rang": r.get("rang")}


def _importee(p: PersonneVivier) -> dict:
    return {"id": f"imp-{p.ident}", "matricule": p.matricule or None, "nom": p.nom, "prenom": p.prenom,
            "source": p.source, "sous_systeme": _ss(p.sous_systeme), "region": p.region,
            "departement": p.departement, "commune": p.commune, "iaeb": "", "ecole_origine": None, "bareme": None,
            "note": p.note, "disponibilite": "libre", "contraintes": [LIBELLES_SOURCE.get(p.source, p.source)]}


def _poste(d: dict, rang: int) -> dict:
    return {"id": d["id_poste"], "id_ecole": texte(d.get(C.COL_ETAB_ID)), "nom_ecole": texte(d.get("nom_etab")),
            "region": texte(d.get(C.COL_ETAB_REGION)), "departement": texte(d.get(C.COL_ETAB_DEPT)),
            "commune": texte(d.get(C.COL_ETAB_COMMUNE)), "sous_systeme": _ss(d.get(C.COL_ETAB_SS)),
            "zone_securite": _zone_securite(d.get(C.COL_ETAB_SIGMA)), "indice_priorite": float(d.get("Up") or 0),
            "rang": rang, "statut": "libre", "nomination_id": None, "_poste": d}


def recrues_du_jeu(jeu) -> List[dict]:
    return [{"id_recrue": x.id_recrue, "nom": x.nom, "prenom": x.prenom, "sous_systeme": x.sous_systeme,
             "region_souhaitee": x.region_souhaitee, "rang": x.rang} for x in jeu.recrues.all()]


def registre(jeu) -> Registre:
    from contextes.diagnostic import services as diag
    from contextes.planification.services import hypotheses_courantes

    sc = scenario_reference(jeu)
    res = sim.charger_resultat(sc)
    reg = Registre(jeu=jeu, scenario=sc, resultat=res, cfg=sim.config_resultat(sc), prep=diag.preparer(jeu),
                   sources=set(hypotheses_courantes(jeu)[0]["vivier"]["sources"]))
    recrues = recrues_du_jeu(jeu)
    reg.deploiements = deployer_recrues(recrues, res["postes_non_pourvus"])
    pris = {d["id_poste"] for d in reg.deploiements["deploiements"]}

    if "excedentaire" in reg.sources:
        reg.vivier += sorted((_excedentaire(d, reg) for d in res["non_affectes"]),
                             key=lambda v: -float(v["bareme"] or 0))
    if "laureat_sans_poste" in reg.sources:
        sans_poste = set(reg.deploiements["recrues_sans_poste"])
        reg.vivier += [_laureat(r) for r in sorted(recrues, key=lambda r: (r["rang"] is None, r["rang"] or 0))
                       if r["id_recrue"] in sans_poste]
    reg.vivier += sorted((_importee(p) for p in jeu.personnes_vivier.all() if p.source in reg.sources),
                         key=lambda v: -float(v["note"] or 0))
    reg.vivier_par_id = {v["id"]: v for v in reg.vivier}

    ouverts = sorted((p for p in res["postes_non_pourvus"] if p["id_poste"] not in pris),
                     key=lambda p: -float(p.get("Up") or 0))
    reg.postes = [_poste(p, i + 1) for i, p in enumerate(ouverts)]
    reg.postes_par_id = {p["id"]: p for p in reg.postes}
    reg.nominations = list(jeu.nominations.all())
    reg.actualiser()
    return reg


# --- Lecture ---------------------------------------------------------------------------------------------------

def personne_de(reg: Registre, n: Nomination) -> dict:
    p = reg.vivier_par_id.get(n.personne_id)
    if p is not None:
        return public(p)
    return {**n.personne, "disponibilite": cycle.disponibilite(reg.statuts_personne.get(n.personne_id, []))}


def poste_de(reg: Registre, n: Nomination) -> dict:
    p = reg.postes_par_id.get(n.poste_id)
    if p is not None:
        return public(p)
    return {**n.poste, "statut": cycle.statut_poste(reg.statuts_poste.get(n.poste_id, [])),
            "nomination_id": str(n.pk) if n.statut in cycle.ENGAGES else None}


def nomination_dict(reg: Registre, n: Nomination) -> dict:
    return {"id": str(n.pk), "personne": personne_de(reg, n), "poste": poste_de(reg, n), "annee": n.annee,
            "statut": n.statut, "origine": n.origine, "motif": n.motif, "reference_decision": n.reference_decision,
            "reference_acte": n.reference_acte, "date_effet": n.date_effet, "creee_le": n.creee_le,
            "historique": n.historique}


def rapprochements_personne(reg: Registre, personne: dict, postes: Optional[List[dict]] = None) -> List[dict]:
    return classer([{**rapprocher(personne, p, reg.cfg), "poste": p}
                    for p in (reg.postes if postes is None else postes)])


def candidats_poste(reg: Registre, poste: dict) -> List[dict]:
    return classer([{**rapprocher(v, poste, reg.cfg), "personne": v} for v in reg.vivier])


def synthese(reg: Registre) -> dict:
    noms = reg.nominations
    par_region: Dict[str, List[str]] = defaultdict(list)
    for n in noms:
        par_region[poste_de(reg, n).get("region") or "Région non renseignée"].append(n.statut)
    return {"scenario_reference": reg.scenario.nom, "scenario_obsolete": sim.est_obsolete(reg.scenario),
            "par_statut": cycle.compter(n.statut for n in noms),
            "par_territoire": [{"territoire": r, "par_statut": cycle.compter(s)}
                               for r, s in sorted(par_region.items())],
            "par_annee": [{"annee": a, "par_statut": cycle.compter(n.statut for n in noms if n.annee == a)}
                          for a in ANNEES_PLAN]}


# --- Écritures -------------------------------------------------------------------------------------------------

def _maintenant() -> str:
    return timezone.now().isoformat()


def _obsolete(jeu, declencheur: str) -> None:
    from contextes.planification.services import marquer_obsolete
    marquer_obsolete(jeu, declencheur)


def _nom(personne: dict) -> str:
    return f"{personne.get('nom', '')} {personne.get('prenom', '')}".strip() or personne.get("id", "")


@transaction.atomic
def proposer(reg: Registre, personne_id: str, poste_id: str, annee: str, motif: str, *, origine: str, request,
             auteur: str) -> Nomination:
    sim.exiger_a_jour(reg.scenario)
    personne = reg.vivier_par_id.get(personne_id)
    poste = reg.postes_par_id.get(poste_id)
    if personne is None:
        raise RefusMetier("Cette personne n'est pas dans le vivier", code="hors_vivier")
    if poste is None:
        raise RefusMetier("Ce poste n'est pas ouvert", code="poste_inconnu")
    if annee not in ANNEES_PLAN:
        raise RefusMetier("Année du plan invalide", [f"Années possibles : {', '.join(ANNEES_PLAN)}"])
    if personne["disponibilite"] != "libre":
        raise Conflit(f"{_nom(personne)} est déjà engagé(e) dans une nomination active.")
    if poste["statut"] != "libre":
        raise Conflit(f"Le poste de {poste['nom_ecole']} est déjà réservé ou pourvu.")
    r = rapprocher(personne, poste, reg.cfg)
    if not r["compatible"]:
        raise RefusMetier("Une règle bloque cette nomination", r["motifs"], code="incompatible")
    n = Nomination.objects.create(
        jeu=reg.jeu, personne_id=personne_id, matricule=personne.get("matricule"), personne=public(personne),
        poste_id=poste_id, poste=public(poste), annee=annee, statut="proposee", origine=origine, motif=motif or None,
        historique=[{"de": None, "vers": "proposee", "le": _maintenant(), "auteur": auteur, "motif": motif or None,
                     "reference": None}])
    reg.nominations.insert(0, n)
    reg.actualiser()
    journaliser(reg.jeu, "nomination", "proposee", f"Nomination proposée : {_nom(personne)} sur {poste['nom_ecole']}",
                request=request, auteur=auteur, objet=("nomination", n.pk), apres={"statut": "proposee"})
    return n


@transaction.atomic
def changer_statut(reg: Registre, n: Nomination, vers: str, *, request, auteur: str, motif: Optional[str] = None,
                   reference: Optional[str] = None, date_effet: Optional[str] = None) -> Nomination:
    if vers in ("validee", "mise_en_oeuvre"):       # rejeter ou annuler reste possible sur un scénario obsolète
        sim.exiger_a_jour(reg.scenario)
    refus = cycle.refus_transition(n.statut, vers)
    if refus:
        raise Conflit(refus)
    if vers in ("rejetee", "annulee") and not (motif or "").strip():
        raise RefusMetier("Le motif est obligatoire", code="motif_manquant")
    if vers == "validee":
        autre = next((x for x in reg.nominations if x.pk != n.pk and x.poste_id == n.poste_id
                      and x.statut in ("validee", "mise_en_oeuvre")), None)
        if autre is not None:
            raise Conflit("Le poste a déjà été réservé par une autre nomination validée.")
        autre = next((x for x in reg.nominations if x.pk != n.pk and x.personne_id == n.personne_id
                      and x.statut in ("validee", "mise_en_oeuvre")), None)
        if autre is not None:
            raise Conflit("Cette personne a déjà une nomination validée.")
        n.reference_decision = (reference or "").strip() or None
    elif vers == "mise_en_oeuvre":
        n.reference_acte = (reference or "").strip() or None
        n.date_effet = (date_effet or "").strip() or timezone.localdate().isoformat()
    else:
        n.motif = motif.strip()
    de = n.statut
    n.statut = vers
    n.historique = [*n.historique, {"de": de, "vers": vers, "le": _maintenant(), "auteur": auteur,
                                    "motif": (motif or "").strip() or None, "reference": (reference or "").strip() or None}]
    n.save()
    reg.actualiser()
    personne = personne_de(reg, n)
    journaliser(reg.jeu, "nomination", vers,
                f"Nomination de {_nom(personne)} sur {poste_de(reg, n).get('nom_ecole', '')} : {cycle.LIBELLES[vers]}",
                request=request, auteur=auteur, objet=("nomination", n.pk), avant={"statut": de},
                apres={"statut": vers, "reference": (reference or None), "date_effet": n.date_effet})
    _obsolete(reg.jeu, "Décision de nomination")
    return n


def generer(reg: Registre, annee: str, *, region: str = "", departement: str = "", request, auteur: str) -> dict:
    """Propositions automatiques : chaque personne libre reçoit le meilleur poste libre compatible.

    Les postes de sa région sont examinés d'abord (la proximité pèse dans le score), puis tous les autres.
    """
    if annee not in ANNEES_PLAN:
        raise RefusMetier("Année du plan invalide", [f"Années possibles : {', '.join(ANNEES_PLAN)}"])
    engages = {n.poste_id for n in reg.nominations if n.statut in cycle.ACTIFS}
    proposees = sans_poste = 0
    for personne in list(reg.vivier):
        if personne["disponibilite"] != "libre":
            continue
        if region and norm(personne["region"]) != norm(region):
            continue
        if departement and norm(personne["departement"]) != norm(departement):
            continue
        # Seuls les postes compatibles (sous-système, hors zone rouge) sont classés : le score coûte cher.
        libres = [p for p in reg.postes if p["statut"] == "libre" and p["id"] not in engages
                  and not p["_poste"].get("est_zone_rouge")
                  and sous_systemes_compatibles(personne["sous_systeme"], p["sous_systeme"])]
        proches = [p for p in libres if personne["region"] and norm(p["region"]) == norm(personne["region"])]
        choix = None
        for candidats in (proches, libres):
            choix = next((r for r in rapprochements_personne(reg, personne, candidats) if r["compatible"]), None)
            if choix:
                break
        if choix is None:
            sans_poste += 1
            continue
        proposer(reg, personne["id"], choix["poste"]["id"], annee, "Meilleur rapprochement du vivier",
                 origine="automatique", request=request, auteur=auteur)
        engages.add(choix["poste"]["id"])
        proposees += 1
    libres = [p for p in reg.postes if p["statut"] == "libre" and p["id"] not in engages]
    return {"proposees": proposees, "sans_poste": sans_poste, "postes_sans_candidat": len(libres)}


# --- Registre des mouvements -------------------------------------------------------------------------------------

def mouvements(reg: Registre) -> List[dict]:
    jeu, res, sc = reg.jeu, reg.resultat, reg.scenario
    realisations = {r.mouvement: r for r in jeu.realisations_mouvements.all()}
    cree_le = sc.resultat.calcule_le if hasattr(sc, "resultat") else None
    prince = {f.id_ens: f.pk for f in jeu.faits_prince.filter(statut="ACTIF")}
    out: List[dict] = []

    def ajouter(ident, type_, personne, origine, dest_id, dest_nom, commune, region, decision, poste, annee="N+1",
                statut=None, realise_le=None, cree=None):
        r = realisations.get(ident)
        out.append({
            "id": ident, "type": type_, "statut": statut or ("realise" if r else "prevu"), "annee": annee,
            "personne": personne, "origine": origine,
            "destination": {"id": dest_id, "nom": dest_nom or reg.nom_ecole(dest_id), "commune": commune,
                            "region": region},
            "decision": decision, "cree_le": cree or cree_le,
            "realise_le": realise_le if statut else (r.date_effet if r else None),
            "_poste": poste, "_lieu": reg.lieu(dest_id, lieu_ecole(dest_id, region, "", commune, "", "")),
        })

    for a in res["affectations"]:
        mat = texte(a.get("id_ens"))
        e = reg.prep.enseignants.get(mat)
        origine = {"id": e.ecole_attache, "nom": reg.nom_ecole(e.ecole_attache)} if e else None
        personne = {"matricule": mat, "nom": f"{a.get('nom_ens', '')} {a.get('prenom_ens', '')}".strip() or mat}
        if a.get("phase") == "effet_de_prince":
            decision = {"type": "fait_prince", "id": str(prince.get(mat, "")), "reference": None}
            ident, type_ = f"prince-{mat}", "fait_prince"
        else:
            decision = {"type": "scenario_retenu", "id": str(sc.pk), "reference": None}
            ident, type_ = f"red-{mat}", "redeploiement"
        ajouter(ident, type_, personne, origine, texte(a.get("id_etab")), texte(a.get("nom_etab")),
                texte(a.get("commune_poste")), texte(a.get("region_poste")), decision, a.get("id_poste"))
    for d in reg.deploiements.get("deploiements", []):
        personne = {"matricule": None, "nom": f"{d.get('nom', '')} {d.get('prenom', '')}".strip() or d["id_recrue"]}
        ajouter(f"rec-{d['id_recrue']}", "deploiement_recrue", personne, None, texte(d.get("id_etab")), "",
                texte(d.get("commune")), texte(d.get("region")),
                {"type": "recrues", "id": d["id_recrue"], "reference": None}, d.get("id_poste"))
    for n in reg.nominations:
        if n.statut not in ("validee", "mise_en_oeuvre"):
            continue
        p, pe = poste_de(reg, n), personne_de(reg, n)
        validation = next((h["le"] for h in n.historique if h.get("vers") == "validee"), None)
        ajouter(f"nom-{n.pk}", "nomination", {"matricule": n.matricule, "nom": _nom(pe)}, pe.get("ecole_origine"),
                p.get("id_ecole", ""), p.get("nom_ecole", ""), p.get("commune", ""), p.get("region", ""),
                {"type": "nomination", "id": str(n.pk), "reference": n.reference_decision}, n.poste_id,
                annee=n.annee, statut="realise" if n.statut == "mise_en_oeuvre" else "prevu",
                realise_le=n.date_effet if n.statut == "mise_en_oeuvre" else None, cree=validation or n.creee_le)
    return out


@transaction.atomic
def realiser_mouvement(reg: Registre, m: dict, *, date_effet: str, reference_acte: str, request, auteur: str) -> None:
    sim.exiger_a_jour(reg.scenario)
    if m["statut"] == "realise":
        raise Conflit("Ce mouvement est déjà réalisé.")
    if m["type"] == "nomination":
        n = next(x for x in reg.nominations if str(x.pk) == m["decision"]["id"])
        changer_statut(reg, n, "mise_en_oeuvre", request=request, auteur=auteur, reference=reference_acte,
                       date_effet=date_effet)
        return
    RealisationMouvement.objects.create(jeu=reg.jeu, mouvement=m["id"], date_effet=date_effet or
                                        timezone.localdate().isoformat(), reference_acte=reference_acte or "",
                                        auteur=auteur)
    journaliser(reg.jeu, "mouvement", "réalisé",
                f"Mouvement réalisé : {m['personne']['nom']} → {m['destination']['nom']}", request=request,
                auteur=auteur, objet=("mouvement", m["id"]), avant={"statut": "prevu"},
                apres={"statut": "realise", "reference_acte": reference_acte, "date_effet": date_effet})
    _obsolete(reg.jeu, "Mouvement réalisé")


# --- Suivi pour la planification -------------------------------------------------------------------------------

def decisions_suivi(jeu) -> dict:
    """Nominations et mouvements situés (lieu de destination), et personnes du vivier hors moteur."""
    reg = registre(jeu)
    nominations = []
    for n in reg.nominations:
        p = poste_de(reg, n)
        lieu = reg.lieu(p.get("id_ecole", ""), lieu_ecole(p.get("id_ecole", ""), p.get("region", ""),
                                                           p.get("departement", ""), p.get("commune", ""), "",
                                                           p.get("sous_systeme") or "non_renseigne"))
        nominations.append({"annee": n.annee, "statut": n.statut, "lieu": lieu})
    mvts = [{"type": m["type"], "annee": m["annee"], "statut": m["statut"], "lieu": m["_lieu"]}
            for m in mouvements(reg)]
    hors_moteur = [{"region": v["region"], "departement": v["departement"], "commune": v["commune"],
                    "sous_systeme": v["sous_systeme"] or "non_renseigne"}
                   for v in reg.vivier if v["source"] != "excedentaire"]
    return {"nominations": nominations, "mouvements": mvts, "hors_moteur": hors_moteur,
            "scenario": reg.scenario}
