"""Prétraitement des faits du Prince : bases enseignants et établissements « après Prince ».

Les faits du Prince sont des décisions obligatoires. Avant que l'algorithme de mobilité ordinaire ne calcule les
besoins, les excédents, les postes ouverts et le vivier, on les applique aux bases :

  - l'enseignant déplacé est rattaché à son école de destination (`ecole_attache`) ;
  - l'effectif déclaré de l'école d'origine baisse de un, celui de l'école de destination augmente de un
    (`Enseignants_Actuels` du référentiel établissements fait foi : il n'est pas recompté à partir des matricules) ;
  - les indicateurs des deux écoles sont recalculés avec les formules habituelles (`calculer_indicateurs`). Le nombre
    d'élèves, les salles et le multigrade ne changent pas, donc P, m, D et BMAX non plus ; E, le REM, le besoin, l'excédent
    et le poids de priorité Up peuvent changer.

Le calcul est pur : les entrées ne sont jamais modifiées, les écoles et enseignants non concernés sont repris tels quels
(mêmes objets) et ce qui change est remplacé par une copie. On repart toujours des bases d'origine : annuler un fait
revient donc à retirer sa ligne, et appliquer deux fois la même liste donne le même résultat.

Complexité : O(écoles + enseignants + décisions), grâce à des index par identifiant.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from typing import Any, Dict, Iterable, List, Optional, Set

from ..commun.texte import norm, texte
from ..diagnostic.indicateurs import calculer_indicateurs
from ..donnees.modeles import Ecole, Enseignant

APPLIQUE = "applique"
APPLIQUE_AVEC_ALERTE = "applique_avec_alerte"
REJETE = "rejete"
STATUTS = (APPLIQUE, APPLIQUE_AVEC_ALERTE, REJETE)

MOTIF_DEFAUT = "Décision de l'autorité (Effet de prince)"


@dataclass
class DecisionPrince:
    """Une décision du Prince et ce qu'on en a fait."""
    ordre: int
    id_ens: str
    id_destination: str
    motif: str
    statut: str = REJETE
    id_origine: str = ""
    alertes: List[str] = field(default_factory=list)
    rejets: List[str] = field(default_factory=list)

    @property
    def appliquee(self) -> bool:
        return self.statut != REJETE


@dataclass
class ApplicationPrince:
    """Résultat du prétraitement : bases recalculées, journal des décisions et écarts à signaler."""
    ecoles: List[Ecole]
    enseignants: List[Enseignant]
    decisions: List[DecisionPrince]
    #: Enseignants déplacés tels qu'ils étaient avant (matricule -> enseignant d'origine).
    enseignants_avant: Dict[str, Enseignant]
    #: Écoles touchées par au moins une décision appliquée, telles qu'elles étaient avant (id -> école).
    ecoles_avant: Dict[str, Ecole]
    #: Écoles touchées, après (id -> école avec indicateurs recalculés).
    ecoles_apres: Dict[str, Ecole]
    #: Écart entre l'effectif déclaré et le nombre de matricules rattachés, pour les écoles touchées seulement.
    ecarts_effectifs: List[dict]
    totaux_avant: Dict[str, int]
    totaux_apres: Dict[str, int]

    @property
    def deplaces(self) -> Set[str]:
        """Matricules des enseignants déplacés : exclus de la mobilité ordinaire."""
        return set(self.enseignants_avant)

    def decisions_appliquees(self) -> List[DecisionPrince]:
        return [d for d in self.decisions if d.appliquee]


def totaux(ecoles: Iterable[Ecole], cfg: dict) -> Dict[str, int]:
    """Enseignants déclarés, postes à pourvoir (somme des besoins entiers) et écoles déficitaires."""
    enseignants = postes = deficitaires = 0
    nb = 0
    for e in ecoles:
        ind = calculer_indicateurs(e, cfg)
        nb += 1
        enseignants += int(e.enseignants_actuels or 0)
        postes += int(ind.be)
        deficitaires += 1 if ind.be > 0 else 0
    return {"ecoles": nb, "enseignants": enseignants, "besoin_postes": postes, "ecoles_deficitaires": deficitaires}


def _decalage(avant: Ecole, apres: Optional[Ecole], cfg: dict) -> Dict[str, int]:
    """Variation des totaux provoquée par le remplacement d'une école par sa version recalculée."""
    a = calculer_indicateurs(avant, cfg)
    b = calculer_indicateurs(apres, cfg) if apres is not None else a
    ee_a, ee_b = int(avant.enseignants_actuels or 0), int((apres or avant).enseignants_actuels or 0)
    return {"enseignants": ee_b - ee_a, "besoin_postes": int(b.be) - int(a.be),
            "ecoles_deficitaires": (1 if b.be > 0 else 0) - (1 if a.be > 0 else 0)}


def appliquer_effets_prince(ecoles: Iterable[Ecole], enseignants: Iterable[Enseignant], faits: Iterable[dict],
                            cfg: dict) -> ApplicationPrince:
    """Applique les faits du Prince, dans l'ordre de la liste, sans modifier les entrées."""
    ecoles = list(ecoles)
    enseignants = list(enseignants)
    faits = list(faits or [])
    par_ecole: Dict[str, Ecole] = {e.id: e for e in ecoles}
    par_ens: Dict[str, Enseignant] = {t.matricule: t for t in enseignants}
    seuils = cfg["seuils"]

    # Décisions d'un même matricule : contradictoires (destinations différentes) = toutes rejetées ; identiques = la
    # première s'applique, les suivantes sont des doublons.
    destinations: Dict[str, List[str]] = defaultdict(list)
    for f in faits:
        destinations[texte(f.get("id_ens"))].append(texte(f.get("id_etab")))
    deja_vu: Set[str] = set()

    courantes: Dict[str, Ecole] = {}          # école -> version courante (effectif mis à jour)
    nouveaux: Dict[str, Enseignant] = {}      # matricule -> enseignant rattaché à sa destination
    avant_ens: Dict[str, Enseignant] = {}
    decisions: List[DecisionPrince] = []

    for ordre, f in enumerate(faits, 1):
        mat, dest = texte(f.get("id_ens")), texte(f.get("id_etab"))
        d = DecisionPrince(ordre=ordre, id_ens=mat, id_destination=dest, motif=texte(f.get("motif")) or MOTIF_DEFAUT)
        decisions.append(d)
        t = par_ens.get(mat)
        rejets = d.rejets
        if not mat or not dest:
            rejets.append("Matricule ou école de destination manquant")
        else:
            if t is None:
                rejets.append(f"Enseignant introuvable dans la base : {mat}")
            if dest not in par_ecole:
                rejets.append(f"École de destination inconnue : {dest}")
            if len(set(destinations[mat])) > 1:
                rejets.append("Plusieurs décisions contradictoires pour ce matricule")
            elif mat in deja_vu:
                rejets.append("Décision en doublon pour ce matricule")
        deja_vu.add(mat)
        if t is not None:
            d.id_origine = t.ecole_attache
            if not rejets:
                if t.ecole_attache not in par_ecole:
                    rejets.append(f"École d'origine inconnue : {t.ecole_attache or '(vide)'}")
                elif t.ecole_attache == dest:
                    rejets.append("L'enseignant est déjà rattaché à cette école")
        if not rejets:
            origine = courantes.get(t.ecole_attache, par_ecole[t.ecole_attache])
            cible = courantes.get(dest, par_ecole[dest])
            if (origine.enseignants_actuels or 0) <= 0:
                rejets.append("L'école d'origine n'a aucun enseignant déclaré (Enseignants_Actuels = 0)")
        if rejets:
            d.statut = REJETE
            continue

        # --- contrôles qui n'empêchent pas la décision mais doivent être connus de la DRH ---
        ind_o, ind_c = calculer_indicateurs(origine, cfg), calculer_indicateurs(cible, cfg)
        if ind_o.xe <= 0:
            d.alertes.append("L'école d'origine n'a pas d'enseignant excédentaire : le départ crée ou aggrave un déficit")
        if norm(t.sous_systeme) and norm(cible.sous_systeme) and norm(t.sous_systeme) != norm(cible.sous_systeme):
            d.alertes.append(f"Changement de sous-système ({t.sous_systeme} → {cible.sous_systeme}) : "
                             "à autoriser explicitement")
        if t.age is not None and t.age >= seuils["age_retraite_ans"]:
            d.alertes.append(f"Âge supérieur ou égal à {seuils['age_retraite_ans']} ans : départ à la retraite")
        if float(t.anciennete_poste or 0) < seuils["anciennete_poste_recevabilite_ans"]:
            d.alertes.append(f"Ancienneté au poste inférieure à {seuils['anciennete_poste_recevabilite_ans']} ans")
        if ind_c.BMAX > 0 and (cible.enseignants_actuels or 0) + 1 > ind_c.BMAX:
            d.alertes.append(f"Capacité physique dépassée à l'arrivée (BMAX = {int(ind_c.BMAX)} salle(s))")
        arrivee = calculer_indicateurs(replace(cible, enseignants_actuels=float(cible.enseignants_actuels) + 1), cfg)
        if arrivee.xe > 0:
            d.alertes.append(f"L'école de destination passe en excédent après l'arrivée "
                             f"({int(arrivee.xe)} enseignant(s) au-delà de sa dotation)")
        d.statut = APPLIQUE_AVEC_ALERTE if d.alertes else APPLIQUE

        courantes[origine.id] = replace(origine, enseignants_actuels=float(origine.enseignants_actuels) - 1)
        courantes[cible.id] = replace(cible, enseignants_actuels=float(cible.enseignants_actuels) + 1)
        avant_ens[mat] = t
        nouveaux[mat] = replace(t, ecole_attache=dest)

    for e in courantes.values():
        e.ind = calculer_indicateurs(e, cfg)

    # --- totaux avant / après : les écoles touchées suffisent à corriger le total d'origine ---
    totaux_avant = totaux(ecoles, cfg)
    totaux_apres = dict(totaux_avant)
    for ident, apres in courantes.items():
        for cle, delta in _decalage(par_ecole[ident], apres, cfg).items():
            totaux_apres[cle] += delta

    # --- écarts entre effectif déclaré et matricules rattachés, pour les écoles touchées ---
    rattaches = Counter(t.ecole_attache for t in enseignants)
    ecarts = []
    for ident in sorted(courantes):
        declares = int(par_ecole[ident].enseignants_actuels or 0)
        if declares != rattaches.get(ident, 0):
            # Bloquant : la décision déplace un matricule réel d'une école dont l'effectif ne se réconcilie pas.
            ecarts.append({"id_ecole": ident, "nom_ecole": par_ecole[ident].nom or ident,
                           "enseignants_declares": declares, "matricules_rattaches": rattaches.get(ident, 0),
                           "ecart": declares - rattaches.get(ident, 0), "bloquant": True})

    return ApplicationPrince(
        ecoles=[courantes.get(e.id, e) for e in ecoles],
        enseignants=[nouveaux.get(t.matricule, t) for t in enseignants],
        decisions=decisions,
        enseignants_avant=avant_ens,
        ecoles_avant={ident: par_ecole[ident] for ident in courantes},
        ecoles_apres=dict(courantes),
        ecarts_effectifs=ecarts,
        totaux_avant=totaux_avant,
        totaux_apres=totaux_apres,
    )
