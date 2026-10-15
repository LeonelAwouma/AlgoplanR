"""Sélection rapide du meilleur poste libre (phases 2 et 3 du moteur).

Même résultat que `moteur.choisir_meilleur_poste` sur la liste des postes libres
(meilleur score arrondi, à égalité le premier poste dans l'ordre de construction),
sans évaluer chaque poste pour chaque enseignant :

- les postes d'une même école forment un bloc contigu dont tous les postes ont le
  même score : chaque bloc n'est évalué qu'une fois, sur son premier poste libre ;
- les textes (commune, département, IAEB, sous-système…) sont normalisés une fois ;
- sous contrainte (même IAEB, même département), seuls les blocs du territoire
  sont évalués ;
- sans contrainte, les blocs sont rangés par classe d'ajustements (multigrade,
  type d'établissement, zone urbaine) et, dans une classe, par poids du poste Up
  décroissant : pour un enseignant donné, le score d'un bloc « ordinaire » de la
  classe ne dépend plus que de Up, et le parcours s'arrête dès que le score baisse.
  Les blocs qui échappent à cette règle (même commune ou même département que
  l'enseignant, écoles bonifiées par son motif) sont évalués un à un.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from ..commun.texte import est_oui, est_vide, norm
from ..donnees.modeles import Enseignant, Poste

TOUS = "*"   # clé des listes sans filtre de sous-système (enseignant sans sous-système renseigné)


class Bloc:
    """Postes contigus d'une même école, identiques pour le score et les filtres."""

    __slots__ = ("rang", "postes", "_suivant", "id_etab", "commune", "departement", "iaeb", "sous_systeme",
                 "acces_urbain", "multigrade", "type_etab", "up", "zone_rouge")

    def __init__(self, rang: int, p: Poste):
        self.rang = rang                      # rang du premier poste dans l'ordre de construction
        self.postes: List[Poste] = [p]
        self._suivant = 0
        self.id_etab = p.id_etab.strip()
        self.commune = norm(p.commune)
        self.departement = norm(p.departement)
        self.iaeb = norm(p.iaeb)
        self.sous_systeme = norm(p.sous_systeme)
        z_to = norm(p.accessibilite)
        self.acces_urbain = "urbain" in z_to or "semi" in z_to
        self.multigrade = est_oui(p.multigrade)
        self.type_etab = str(p.type_etab or "").upper()
        self.up = float(p.Up or 0)
        self.zone_rouge = bool(p.est_zone_rouge)

    @staticmethod
    def signature(p: Poste) -> tuple:
        return (p.id_etab, p.commune, p.departement, p.iaeb, p.sous_systeme, p.accessibilite, p.multigrade,
                p.type_etab, p.Up, p.est_zone_rouge)

    def premier_libre(self) -> Optional[Poste]:
        """Premier poste libre du bloc. Un poste pourvu ne se libère jamais : le curseur ne recule pas."""
        while self._suivant < len(self.postes) and self.postes[self._suivant].pourvu:
            self._suivant += 1
        return self.postes[self._suivant] if self._suivant < len(self.postes) else None

    def classe(self) -> tuple:
        return (self.multigrade, self.type_etab if self.type_etab in ("IAEB", "DREB", "DELEGATION") else "",
                self.acces_urbain)


class _Profil:
    """Grandeurs de l'enseignant utilisées par le score, normalisées une fois."""

    __slots__ = ("z1", "commune", "departement", "iaeb", "sous_systeme", "age", "rural_ancien", "bonifiees")

    def __init__(self, e: Enseignant, cfg: dict):
        w = cfg["poids_score_appariement"]
        self.z1 = w["Z1_bareme_individu"] * float(e.bareme or 0)
        self.commune = norm(e.commune_attache)
        self.departement = norm(e.departement_attache)
        self.iaeb = norm(e.iaeb_attache)
        self.sous_systeme = norm(e.sous_systeme)
        self.age = float(e.age or 35)
        self.rural_ancien = "rural" in norm(e.zone_attache) and float(e.anciennete_poste or 0) >= 5
        # Écoles bonifiées par le motif (score.ajustements_contextuels).
        self.bonifiees: frozenset = frozenset()
        motif = (e.motif_bonification or "").strip()
        if not est_vide(motif):
            voeux = [v.strip() for v in e.voeux if v and not est_vide(v)]
            cible = next((v for v in voeux if v and v.lower() in motif.lower()), None)
            self.bonifiees = frozenset([cible]) if cible else frozenset(voeux)


def _score(pr: _Profil, b: Bloc, cfg: dict) -> float:
    """Exactement score.score_enseignant_poste, sur les grandeurs prénormalisées."""
    pts = cfg["points_proximite"]
    if pr.commune and pr.commune == b.commune:
        prox = float(pts["meme_commune"])
    elif pr.departement and pr.departement == b.departement:
        prox = float(pts["meme_departement"])
    else:
        prox = float(pts["autre"])

    ajust = cfg["ajustements_contextuels"]
    seuils = cfg["seuils"]
    adj = 0.0
    if pr.age <= seuils["age_jeune_ans"] and b.multigrade:
        adj += ajust["appui_multigrades_jeune"]
    if pr.age >= seuils["age_senior_ans"] and b.type_etab in ("IAEB", "DREB", "DELEGATION"):
        adj += ajust["senior_vers_encadrement"]
    if pr.age >= seuils["age_senior_ans"] and not b.multigrade and b.type_etab not in ("IAEB", "DREB"):
        adj += ajust["allegement_senior_standard"]
    if pr.rural_ancien and b.acces_urbain:
        adj += ajust["transition_rural_urbain"]
    if b.id_etab in pr.bonifiees:
        adj += ajust["bonification_ciblee"]

    w = cfg["poids_score_appariement"]
    return round(pr.z1 + w["Z2_poids_poste_Up"] * b.up + w["Z3_proximite"] * prox
                 + w["Z4_ajustements"] * float(adj), 4)


class IndexPostes:
    """Index des postes libres non situés en zone rouge, construit une fois par exécution du moteur."""

    def __init__(self, postes: List[Poste]):
        self.blocs: List[Bloc] = []
        precedent = None
        for p in postes:
            if p.pourvu or p.est_zone_rouge:
                # Les phases 2 et 3 n'affectent jamais en zone rouge ; un poste déjà pourvu ne se libère pas.
                precedent = None
                continue
            sig = Bloc.signature(p)
            if precedent is not None and sig == precedent:
                self.blocs[-1].postes.append(p)
            else:
                self.blocs.append(Bloc(len(self.blocs), p))
                precedent = sig

        self.par_iaeb: Dict[str, List[Bloc]] = {}
        self.par_departement: Dict[str, List[Bloc]] = {}
        self.par_commune: Dict[str, List[Bloc]] = {}
        self.par_etab: Dict[str, List[Bloc]] = {}
        # Listes par sous-système (et pour tous) puis par classe d'ajustements, Up décroissant puis rang.
        self.par_classe: Dict[str, Dict[tuple, List[Bloc]]] = {TOUS: {}}
        for b in self.blocs:
            self.par_iaeb.setdefault(b.iaeb, []).append(b)
            self.par_departement.setdefault(b.departement, []).append(b)
            self.par_commune.setdefault(b.commune, []).append(b)
            self.par_etab.setdefault(b.id_etab, []).append(b)
            for cle in (TOUS, b.sous_systeme):
                self.par_classe.setdefault(cle, {}).setdefault(b.classe(), []).append(b)
        for classes in self.par_classe.values():
            for liste in classes.values():
                liste.sort(key=lambda b: (-b.up, b.rang))

    def meilleur(self, e: Enseignant, cfg: dict, *, contrainte_dept: bool = False,
                 contrainte_iaeb: bool = False) -> Optional[Poste]:
        pr = _Profil(e, cfg)
        ss = pr.sous_systeme
        meilleur: Tuple[float, int, Optional[Poste]] = (float("-inf"), -1, None)

        def evaluer(b: Bloc) -> None:
            nonlocal meilleur
            if ss and b.sous_systeme != ss:
                return
            p = b.premier_libre()
            if p is None:
                return
            s = _score(pr, b, cfg)
            if s > meilleur[0] or (s == meilleur[0] and b.rang < meilleur[1]):
                meilleur = (s, b.rang, p)

        if contrainte_iaeb and pr.iaeb:
            for b in self.par_iaeb.get(pr.iaeb, []):
                evaluer(b)
            return meilleur[2]
        if contrainte_dept and pr.departement:
            for b in self.par_departement.get(pr.departement, []):
                evaluer(b)
            return meilleur[2]

        # Sans contrainte : blocs particuliers évalués un à un…
        for b in self.par_commune.get(pr.commune, []) if pr.commune else []:
            evaluer(b)
        for b in self.par_departement.get(pr.departement, []) if pr.departement else []:
            evaluer(b)
        for etab in pr.bonifiees:
            for b in self.par_etab.get(etab, []):
                evaluer(b)

        # … puis, dans chaque classe, les blocs ordinaires par Up décroissant.
        for liste in self.par_classe.get(ss or TOUS, {}).values():
            tete: Optional[float] = None
            for b in liste:
                if (pr.commune and b.commune == pr.commune) or (pr.departement and b.departement == pr.departement) \
                        or b.id_etab in pr.bonifiees:
                    continue
                p = b.premier_libre()
                if p is None:
                    continue
                s = _score(pr, b, cfg)
                if tete is None:
                    tete = s
                elif s < tete:
                    break        # le score ne fait plus que baisser dans cette classe
                if s > meilleur[0] or (s == meilleur[0] and b.rang < meilleur[1]):
                    meilleur = (s, b.rang, p)
        return meilleur[2]
