"""Entités du domaine : Ecole (avec indicateurs), Enseignant, Poste. Python pur, sans pandas."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from ..commun.texte import nombre, nombre_ou_none, norm, texte
from . import colonnes as C


@dataclass
class Indicateurs:
    """Résultat des formules des parties 2 et 3 du référentiel MINEDUB."""
    Pe: int = 1
    me: int = 6
    De: int = 6
    BMAX: float = 0.0
    Ke: float = 0.0
    be: float = 0.0
    xe: float = 0.0
    se: float = 0.0
    ae: float = 0.0
    alpha: int = 0
    sigma: int = 0
    Wp: float = 0.0
    beta: int = 0
    Up: float = 0.0
    niveau_difficulte: int = 3
    nb_postes_ouverts: int = 0
    est_necessiteuse: bool = False
    est_excedentaire: bool = False
    est_zone_rouge: bool = False
    #: Besoin selon le REM de référence, ⌈N ÷ REM⌉ (rapport MINEDUB) ; None si l'effectif d'élèves est inconnu.
    Ce: Optional[int] = None
    #: Groupes pédagogiques retenus et leur provenance (observe, estime, secours, indetermine).
    Ge: int = 6
    Ge_provenance: str = "secours"
    #: Classes multigrades lues (None si vide ou illisible) et statut de lecture de la colonne.
    Me: Optional[int] = None
    multigrades_statut: str = "non_renseigne"
    minimum_provisoire: bool = True
    minimum_observe: bool = False
    #: confirme | estime | provisoire : fiabilité du besoin final (b et x), et non du seul minimum pédagogique. Un
    #: minimum provisoire laisse le besoin « confirmé » quand l'effectif d'élèves ou les salles fixent le résultat.
    statut_besoin: str = "provisoire"
    #: Besoin final incertain (statut estime ou provisoire) et fourchette du besoin b sur les organisations plausibles.
    besoin_final_incertain: bool = True
    be_min: float = 0.0
    be_max: float = 0.0
    #: Excédent sûr (mobilisable sans validation) et part qui dépend d'une hypothèse sur les groupes.
    xe_sur: float = 0.0
    xe_a_verifier: float = 0.0
    #: Salles connues mais mode simple / double flux non renseigné : BMAX repose sur le total des salles.
    bmax_incertain: bool = False


@dataclass
class Ecole:
    id: str
    sous_systeme: str = "Francophone"
    region: str = ""
    departement: str = ""
    commune: str = ""
    iaeb: str = ""
    effectif_eleves: float = 0.0          # Ne
    enseignants_actuels: float = 0.0      # Ee
    salles_simple_flux: float = 0.0
    salles_double_flux: float = 0.0
    accessibilite: str = ""
    securite: str = ""
    multigrade: str = ""
    nom: str = ""
    type_etab: str = "ECOLE"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    #: Données absentes du fichier (colonne absente ou cellule vide) : le calcul garde 0, mais l'école est signalée.
    effectif_connu: bool = True          # effectif d'élèves renseigné
    salles_connues: bool = True          # au moins une des deux colonnes de salles renseignée (sinon BMAX = 0 : inconnu)
    #: Colonne Salles_Double_Flux renseignée ; None pour les données enregistrées avant ce suivi (inconnu).
    salles_double_flux_connues: Optional[bool] = None
    #: Nombre de classes réellement ouvertes (colonne optionnelle) ; None tant que le fichier ne le donne pas.
    classes_ouvertes: Optional[float] = None
    ind: Indicateurs = field(default_factory=Indicateurs)

    def vers_dict(self) -> Dict[str, Any]:
        """Représentation à plat avec les noms de colonnes officiels (sortie `etab_enrichi`)."""
        i = self.ind
        d = {
            C.COL_ETAB_ID: self.id, C.COL_ETAB_SS: self.sous_systeme, C.COL_ETAB_REGION: self.region,
            C.COL_ETAB_DEPT: self.departement, C.COL_ETAB_COMMUNE: self.commune, C.COL_ETAB_IAEB: self.iaeb,
            C.COL_ETAB_NE: self.effectif_eleves, C.COL_ETAB_EE: self.enseignants_actuels,
            C.COL_ETAB_SSF: self.salles_simple_flux, C.COL_ETAB_SDF: self.salles_double_flux,
            C.COL_ETAB_ALPHA: self.accessibilite, C.COL_ETAB_SIGMA: self.securite,
            C.COL_ETAB_MULTIGRADE: self.multigrade, "nom_etab": self.nom or self.id, "type_etab": self.type_etab,
            "effectif_connu": self.effectif_connu, "salles_connues": self.salles_connues,
            C.COL_ETAB_CLASSES_OUVERTES: self.classes_ouvertes,
            "Pe": i.Pe, "me": i.me, "De": i.De, "BMAX": i.BMAX, "Ke": i.Ke, "be": i.be, "xe": i.xe,
            "se": i.se, "ae": i.ae, "alpha": i.alpha, "sigma": i.sigma, "Wp": i.Wp, "beta": i.beta,
            "Up": i.Up, "niveau_difficulte": i.niveau_difficulte, "nb_postes_ouverts": i.nb_postes_ouverts,
            "est_necessiteuse": i.est_necessiteuse, "est_excedentaire": i.est_excedentaire,
            "est_zone_rouge": i.est_zone_rouge,
            "Ce": i.Ce, "Ge": i.Ge, "Ge_provenance": i.Ge_provenance, "Me": i.Me,
            "multigrades_statut": i.multigrades_statut, "minimum_provisoire": i.minimum_provisoire,
            "statut_besoin": i.statut_besoin, "xe_sur": i.xe_sur, "xe_a_verifier": i.xe_a_verifier,
            "besoin_final_incertain": i.besoin_final_incertain, "be_min": i.be_min, "be_max": i.be_max,
            "bmax_incertain": i.bmax_incertain, "salles_double_flux_connues": self.salles_double_flux_connues,
        }
        if self.latitude is not None:
            d["latitude"] = self.latitude
        if self.longitude is not None:
            d["longitude"] = self.longitude
        return d


@dataclass
class Enseignant:
    matricule: str
    sous_systeme: str = "Francophone"
    ecole_attache: str = ""
    age: Optional[float] = 35.0
    anciennete_carriere: float = 0.0
    anciennete_poste: float = 0.0
    annees_zone_1: float = 0.0
    annees_zone_2: float = 0.0
    situation: str = ""
    enfants: float = 0.0
    formations: float = 0.0
    voeux: Tuple[str, str, str] = ("", "", "")
    motif_bonification: str = ""
    nom: str = ""
    prenom: str = ""
    # enrichissement via l'école d'attache
    commune_attache: str = ""
    departement_attache: str = ""
    region_attache: str = ""
    iaeb_attache: str = ""
    #: Âge renseigné dans le fichier. Sinon l'âge vaut 35 ans par défaut (colonne absente) ou reste vide (cellule vide).
    age_connu: bool = True
    zone_attache: str = ""
    alpha_attache: float = 0
    sigma_attache: float = 0
    etab_attache_excedentaire: bool = False
    # calculé à la constitution du vivier
    bareme: float = 0.0

    def vers_dict(self) -> Dict[str, Any]:
        return {
            C.COL_ENS_ID: self.matricule, "nom": self.nom, "prenom": self.prenom,
            C.COL_ENS_SS: self.sous_systeme, C.COL_ENS_ETAB: self.ecole_attache, C.COL_ENS_AGE: self.age,
            C.COL_ENS_ANC_CAR: self.anciennete_carriere, C.COL_ENS_ANC_POSTE: self.anciennete_poste,
            C.COL_ENS_N1: self.annees_zone_1, C.COL_ENS_N2: self.annees_zone_2,
            C.COL_ENS_SITU: self.situation, C.COL_ENS_ENFANTS: self.enfants, C.COL_ENS_FORM: self.formations,
            C.COL_ENS_V1: self.voeux[0], C.COL_ENS_V2: self.voeux[1], C.COL_ENS_V3: self.voeux[2],
            C.COL_ENS_MOTIF: self.motif_bonification, "age_connu": self.age_connu,
            "commune_attache": self.commune_attache, "departement_attache": self.departement_attache,
            "region_attache": self.region_attache, "iaeb_attache": self.iaeb_attache,
            "zone_attache": self.zone_attache, "etab_attache_excedentaire": self.etab_attache_excedentaire,
            "bareme": self.bareme,
        }


@dataclass
class Poste:
    id_poste: str
    id_etab: str
    nom_etab: str = ""
    commune: str = ""
    departement: str = ""
    region: str = ""
    iaeb: str = ""
    accessibilite: str = ""
    securite: str = ""
    multigrade: str = ""
    sous_systeme: str = "Francophone"
    type_etab: str = "ECOLE"
    Up: float = 0.0
    Wp: float = 0.0
    est_zone_rouge: bool = False
    pourvu: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    def vers_dict(self) -> Dict[str, Any]:
        d = {
            "id_poste": self.id_poste, C.COL_ETAB_ID: self.id_etab, "nom_etab": self.nom_etab,
            C.COL_ETAB_COMMUNE: self.commune, C.COL_ETAB_DEPT: self.departement, C.COL_ETAB_REGION: self.region,
            C.COL_ETAB_IAEB: self.iaeb, C.COL_ETAB_ALPHA: self.accessibilite, C.COL_ETAB_SIGMA: self.securite,
            C.COL_ETAB_MULTIGRADE: self.multigrade, C.COL_ETAB_SS: self.sous_systeme, "type_etab": self.type_etab,
            "Up": self.Up, "Wp": self.Wp, "est_zone_rouge": self.est_zone_rouge, "pourvu": self.pourvu,
        }
        if self.latitude is not None:
            d["latitude"] = self.latitude
        if self.longitude is not None:
            d["longitude"] = self.longitude
        return d


# ---------------------------------------------------------------------------
# Construction depuis des lignes brutes (dictionnaires clé = nom de colonne officiel)
# ---------------------------------------------------------------------------

def construire_ecole(ligne: Dict[str, Any]) -> Ecole:
    ident = texte(ligne.get(C.COL_ETAB_ID))
    if not ident:
        raise ValueError(f"Colonne obligatoire manquante ou vide : {C.COL_ETAB_ID}")
    return Ecole(
        id=ident,
        sous_systeme=texte(ligne.get(C.COL_ETAB_SS), "Francophone") or "Francophone",
        region=texte(ligne.get(C.COL_ETAB_REGION)),
        departement=texte(ligne.get(C.COL_ETAB_DEPT)),
        commune=texte(ligne.get(C.COL_ETAB_COMMUNE)),
        iaeb=texte(ligne.get(C.COL_ETAB_IAEB)),
        effectif_eleves=nombre(ligne.get(C.COL_ETAB_NE)),
        enseignants_actuels=nombre(ligne.get(C.COL_ETAB_EE)),
        salles_simple_flux=nombre(ligne.get(C.COL_ETAB_SSF)),
        salles_double_flux=nombre(ligne.get(C.COL_ETAB_SDF)),
        accessibilite=texte(ligne.get(C.COL_ETAB_ALPHA)),
        securite=texte(ligne.get(C.COL_ETAB_SIGMA)),
        multigrade=texte(ligne.get(C.COL_ETAB_MULTIGRADE)),
        nom=texte(ligne.get("nom_etab")),
        type_etab=texte(ligne.get("type_etab"), "ECOLE") or "ECOLE",
        latitude=nombre_ou_none(ligne.get("latitude")),
        longitude=nombre_ou_none(ligne.get("longitude")),
        effectif_connu=nombre_ou_none(ligne.get(C.COL_ETAB_NE)) is not None,
        salles_connues=(nombre_ou_none(ligne.get(C.COL_ETAB_SSF)) is not None
                        or nombre_ou_none(ligne.get(C.COL_ETAB_SDF)) is not None),
        salles_double_flux_connues=nombre_ou_none(ligne.get(C.COL_ETAB_SDF)) is not None,
        classes_ouvertes=nombre_ou_none(ligne.get(C.COL_ETAB_CLASSES_OUVERTES)),
    )


def construire_enseignant(ligne: Dict[str, Any]) -> Enseignant:
    mat = texte(ligne.get(C.COL_ENS_ID))
    if not mat:
        raise ValueError(f"Colonne obligatoire manquante ou vide : {C.COL_ENS_ID}")
    if C.COL_ENS_AGE in ligne:
        age = nombre_ou_none(ligne.get(C.COL_ENS_AGE))
    else:
        age = 35.0       # colonne absente : 35 ans supposés, signalé par age_connu = False et par le rapport de qualité
    ss = ligne.get(C.COL_ENS_SS) if C.COL_ENS_SS in ligne else "Francophone"

    def vide(v) -> str:
        return "" if norm(v) in ("", "nan", "none", "n/a", "na", "null") else texte(v)

    return Enseignant(
        matricule=mat,
        sous_systeme=texte(ss),
        ecole_attache=texte(ligne.get(C.COL_ENS_ETAB)),
        age=age,
        anciennete_carriere=nombre(ligne.get(C.COL_ENS_ANC_CAR)),
        anciennete_poste=nombre(ligne.get(C.COL_ENS_ANC_POSTE)),
        annees_zone_1=nombre(ligne.get(C.COL_ENS_N1)),
        annees_zone_2=nombre(ligne.get(C.COL_ENS_N2)),
        situation=texte(ligne.get(C.COL_ENS_SITU)),
        enfants=nombre(ligne.get(C.COL_ENS_ENFANTS)),
        formations=nombre(ligne.get(C.COL_ENS_FORM)),
        voeux=(vide(ligne.get(C.COL_ENS_V1)), vide(ligne.get(C.COL_ENS_V2)), vide(ligne.get(C.COL_ENS_V3))),
        motif_bonification=texte(ligne.get(C.COL_ENS_MOTIF)),
        age_connu=C.COL_ENS_AGE in ligne and age is not None,
        nom=texte(ligne.get("nom")),
        prenom=texte(ligne.get("prenom")),
    )
