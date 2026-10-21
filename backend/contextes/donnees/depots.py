"""Dépôts : correspondance ORM <-> objets du domaine."""
from __future__ import annotations

from typing import Any, Dict, List

from domaine.donnees import colonnes as C
from domaine.donnees.modeles import Ecole, Enseignant, construire_ecole, construire_enseignant

from .models import Enseignant as EnseignantDb
from .models import Etablissement as EtablissementDb


def _ecole(m: EtablissementDb) -> Ecole:
    e = construire_ecole({
        C.COL_ETAB_ID: m.id_ecole, C.COL_ETAB_SS: m.sous_systeme, C.COL_ETAB_REGION: m.region,
        C.COL_ETAB_DEPT: m.departement, C.COL_ETAB_COMMUNE: m.commune, C.COL_ETAB_IAEB: m.iaeb,
        C.COL_ETAB_NE: m.effectif_eleves, C.COL_ETAB_EE: m.enseignants_actuels,
        C.COL_ETAB_SSF: m.salles_simple_flux, C.COL_ETAB_SDF: m.salles_double_flux,
        C.COL_ETAB_ALPHA: m.accessibilite, C.COL_ETAB_SIGMA: m.securite, C.COL_ETAB_MULTIGRADE: m.multigrade,
        "nom_etab": m.nom, "type_etab": m.type_etab, "latitude": m.latitude, "longitude": m.longitude,
    })
    e.effectif_connu, e.salles_connues, e.classes_ouvertes = m.effectif_connu, m.salles_connues, m.classes_ouvertes
    return e


def _enseignant(m: EnseignantDb) -> Enseignant:
    e = construire_enseignant({
        C.COL_ENS_ID: m.matricule, "nom": m.nom, "prenom": m.prenom, C.COL_ENS_SS: m.sous_systeme,
        C.COL_ENS_ETAB: m.ecole_attache, C.COL_ENS_AGE: m.age, C.COL_ENS_ANC_CAR: m.anciennete_carriere,
        C.COL_ENS_ANC_POSTE: m.anciennete_poste, C.COL_ENS_N1: m.annees_zone_1, C.COL_ENS_N2: m.annees_zone_2,
        C.COL_ENS_SITU: m.situation, C.COL_ENS_ENFANTS: m.enfants, C.COL_ENS_FORM: m.formations,
        C.COL_ENS_V1: m.voeu_1, C.COL_ENS_V2: m.voeu_2, C.COL_ENS_V3: m.voeu_3,
        C.COL_ENS_MOTIF: m.motif_bonification,
    })
    e.age_connu = m.age_connu
    return e


def charger_ecoles(jeu) -> List[Ecole]:
    return [_ecole(m) for m in EtablissementDb.objects.filter(jeu=jeu).order_by("ordre")]


def charger_enseignants(jeu) -> List[Enseignant]:
    return [_enseignant(m) for m in EnseignantDb.objects.filter(jeu=jeu).order_by("ordre")]


def enregistrer(jeu, ecoles: List[Ecole], enseignants: List[Enseignant]) -> None:
    EtablissementDb.objects.bulk_create([
        EtablissementDb(
            jeu=jeu, id_ecole=e.id, sous_systeme=e.sous_systeme, region=e.region, departement=e.departement,
            commune=e.commune, iaeb=e.iaeb, effectif_eleves=e.effectif_eleves,
            enseignants_actuels=e.enseignants_actuels, salles_simple_flux=e.salles_simple_flux,
            salles_double_flux=e.salles_double_flux, accessibilite=e.accessibilite, securite=e.securite,
            multigrade=e.multigrade, nom=e.nom, type_etab=e.type_etab, latitude=e.latitude,
            longitude=e.longitude, effectif_connu=e.effectif_connu, salles_connues=e.salles_connues,
            classes_ouvertes=e.classes_ouvertes, ordre=i)
        for i, e in enumerate(ecoles)], batch_size=500)
    EnseignantDb.objects.bulk_create([
        EnseignantDb(
            jeu=jeu, matricule=x.matricule, nom=x.nom, prenom=x.prenom, sous_systeme=x.sous_systeme,
            ecole_attache=x.ecole_attache, age=x.age, anciennete_carriere=x.anciennete_carriere,
            anciennete_poste=x.anciennete_poste, annees_zone_1=x.annees_zone_1, annees_zone_2=x.annees_zone_2,
            situation=x.situation, enfants=x.enfants, formations=x.formations, voeu_1=x.voeux[0],
            voeu_2=x.voeux[1], voeu_3=x.voeux[2], motif_bonification=x.motif_bonification,
            age_connu=x.age_connu, ordre=i)
        for i, x in enumerate(enseignants)], batch_size=500)
