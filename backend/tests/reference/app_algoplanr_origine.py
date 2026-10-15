#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AlgoPlanR — Application Desktop Native (PySide6 / Qt)
Système Intégré d'Affectation des Enseignants (MINEDUB / PAREC)
Design Modern Dashboard & Cartographie Géographique Interactive
Intégration du module : « Effet de Prince » (Affectations discrétionnaires)

Version 2.1 — Conforme au Référentiel Officiel MINEDUB
Distribution Desktop autonome sans installation de Python.
"""

from __future__ import annotations

import io
import json
import os
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-gpu --no-sandbox --disable-logging"
import sys
import tempfile
import traceback
import webbrowser
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# Matplotlib fallback / rendering
try:
    import matplotlib
    matplotlib.use("QtAgg")
    from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
    from matplotlib.figure import Figure
    HAS_MATPLOTLIB = True
except Exception:
    HAS_MATPLOTLIB = False

# Plotly
try:
    import plotly.express as px
    import plotly.graph_objects as go
    import plotly.io as pio
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False

# PySide6
try:
    from PySide6.QtCore import Qt, QCoreApplication, QThread, Signal, Slot, QSize, QUrl
    from PySide6.QtGui import QIcon, QPixmap, QFont, QColor
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QGridLayout, QSplitter, QScrollArea, QFrame, QLabel, QPushButton,
        QLineEdit, QCheckBox, QComboBox, QSlider, QDoubleSpinBox, QTabWidget,
        QTableWidget, QTableWidgetItem, QHeaderView, QFileDialog,
        QMessageBox, QProgressBar, QTextBrowser, QGroupBox, QSizePolicy
    )
    HAS_PYSIDE6 = True
except Exception:
    HAS_PYSIDE6 = False

# QtWebEngine for interactive Plotly charts
try:
    from PySide6.QtWebEngineWidgets import QWebEngineView
    HAS_WEBENGINE = True
except Exception:
    HAS_WEBENGINE = False


# ============================================================
# CONFIG PAR DÉFAUT (CONFORME AU RÉFÉRENTIEL MINEDUB - PARTIE 3)
# ============================================================

DEFAULT_CONFIG = {
    "seuils": {
        "anciennete_poste_recevabilite_ans": 5,
        "age_senior_ans": 50,
        "age_jeune_ans": 35,
        "age_retraite_ans": 60,
    },
    "poids_bareme_individuel": {
        "C1_carriere_zone": 0.30,
        "C2_anciennete_poste": 0.25,
        "C3_charges_familiales": 0.20,
        "C4_formation_continue": 0.15,
        "C5_cohorte_age": 0.10,
    },
    "points_situation_familiale": {
        "celibataire": 10, "divorce": 8, "veuf": 8, "marie": 5,
    },
    "poids_score_appariement": {
        "Z1_bareme_individu": 0.25,
        "Z2_poids_poste_Up": 0.25,
        "Z3_proximite": 0.25,
        "Z4_ajustements": 0.25,
    },
    "points_proximite": {
        "meme_commune": 60, "meme_departement": 30, "autre": 0,
    },
    "ajustements_contextuels": {
        "appui_multigrades_jeune": 15,
        "senior_vers_encadrement": 15,
        "allegement_senior_standard": 8,
        "transition_rural_urbain": 12,
        "bonification_ciblee": 20,
    },
    "vulnerabilite": {"t1": 0.30, "t2": 0.70},
    "regles_dreb": {
        "phase1_voeux_actif": True,
        "phase2_proximite_iaeb": True,
        "phase2_proximite_departement": True,
        "phase3_extension_regionale": True,
        "phase4_vivier_recrutement": True,
    }
}

MOT_DE_PASSE_EFFET_DE_PRINCE = "ADMIN2026"

# ============================================================
# NOMS DE COLONNES OFFICIELS (Format Entrée / Sortie)
# ============================================================

COL_ETAB_ID = "Identifiant_Ecole"
COL_ETAB_SS = "Sous_Systeme"
COL_ETAB_REGION = "Region"
COL_ETAB_DEPT = "Departement"
COL_ETAB_COMMUNE = "Commune"
COL_ETAB_IAEB = "Circonscription_IAEB"
COL_ETAB_NE = "Effectif_Eleves_Attendus"
COL_ETAB_EE = "Enseignants_Actuels"
COL_ETAB_SSF = "Salles_Simple_Flux"
COL_ETAB_SDF = "Salles_Double_Flux"
COL_ETAB_ALPHA = "Accessibilite_Zone"
COL_ETAB_SIGMA = "Securite_Zone"
COL_ETAB_MULTIGRADE = "Classes_Multigrades"

COL_ENS_ID = "Matricule_Enseignant"
COL_ENS_SS = "Sous_Systeme_Formation"
COL_ENS_ETAB = "Ecole_Attache_Actuelle"
COL_ENS_AGE = "Age"
COL_ENS_ANC_CAR = "Anciennete_Carriere"
COL_ENS_ANC_POSTE = "Anciennete_Poste_Actuel"
COL_ENS_N1 = "Annees_Zone_Difficulte_1"
COL_ENS_N2 = "Annees_Zone_Difficulte_2"
COL_ENS_SITU = "Situation_Matrimoniale"
COL_ENS_ENFANTS = "Nombre_Enfants_A_Charge"
COL_ENS_FORM = "Formations_Continues"
COL_ENS_V1 = "Voeu_1"
COL_ENS_V2 = "Voeu_2"
COL_ENS_V3 = "Voeu_3"
COL_ENS_MOTIF = "Motif_Bonification"

COLONNES_ATTENDUES_ETAB = [
    "Identifiant_Ecole", "Sous_Systeme", "Region", "Departement", "Commune",
    "Circonscription_IAEB", "Effectif_Eleves_Attendus", "Enseignants_Actuels",
    "Salles_Simple_Flux", "Salles_Double_Flux", "Accessibilite_Zone",
    "Securite_Zone", "Classes_Multigrades",
]

COLONNES_ATTENDUES_ENS = [
    "Matricule_Enseignant", "Sous_Systeme_Formation", "Ecole_Attache_Actuelle",
    "Age", "Anciennete_Carriere", "Anciennete_Poste_Actuel",
    "Annees_Zone_Difficulte_1", "Annees_Zone_Difficulte_2",
    "Situation_Matrimoniale", "Nombre_Enfants_A_Charge",
    "Formations_Continues", "Voeu_1", "Voeu_2", "Voeu_3", "Motif_Bonification",
]


# ============================================================
# HELPERS
# ============================================================

def _str_norm(x) -> str:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ""
    return str(x).strip().lower()


def _is_oui(x) -> bool:
    return _str_norm(x) in ["oui", "yes", "1", "true", "vrai", "y"]


def _is_vide(x) -> bool:
    s = _str_norm(x)
    return s in ("", "nan", "none", "n/a", "na", "null")


# ============================================================
# GESTION PORTABLE DES RESSOURCES & LOGOS (COMPATIBLE PYINSTALLER)
# ============================================================

def resource_path(relative_path: str) -> str:
    """Renvoie le chemin absolu vers une ressource, compatible developpement et PyInstaller."""
    if hasattr(sys, '_MEIPASS'):
        p = os.path.join(sys._MEIPASS, relative_path)
        if os.path.exists(p):
            return p

    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        p = os.path.join(exe_dir, relative_path)
        if os.path.exists(p):
            return p

    script_dir = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(script_dir, relative_path)
    if os.path.exists(p):
        return p

    p = os.path.join(os.getcwd(), relative_path)
    if os.path.exists(p):
        return p

    return relative_path


def trouver_chemin_logo(nom_fichier: str, ancien_chemin_absolu: str = "") -> str:
    """Recherche portable des logos sur n importe quelle machine."""
    for candidate in [nom_fichier, os.path.join("assets", nom_fichier), os.path.join("images", nom_fichier)]:
        res = resource_path(candidate)
        if os.path.exists(res):
            return res

    if ancien_chemin_absolu and os.path.exists(ancien_chemin_absolu):
        return ancien_chemin_absolu

    return ""


def verifier_colonnes(df_columns, colonnes_attendues):
    cols_df = [str(c).lower().strip() for c in df_columns]
    return [c for c in colonnes_attendues if c.lower() not in cols_df]


# ============================================================
# MODULE MATHÉMATIQUE (FIDÈLE À 100%)
# ============================================================

def calculer_indicateurs_mathematiques(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Implémente rigoureusement les formules des Parties 2 et 3 du Guide MINEDUB."""
    df = df.copy()

    df['_Ne'] = pd.to_numeric(df.get(COL_ETAB_NE, 0), errors='coerce').fillna(0)
    df['_Ee'] = pd.to_numeric(df.get(COL_ETAB_EE, 0), errors='coerce').fillna(0)
    df['_SSF'] = pd.to_numeric(df.get(COL_ETAB_SSF, 0), errors='coerce').fillna(0)
    df['_SDF'] = pd.to_numeric(df.get(COL_ETAB_SDF, 0), errors='coerce').fillna(0)

    def _nb_niveaux(row):
        return 6 if _is_oui(row.get(COL_ETAB_MULTIGRADE, '')) else 6
    df['_nb_niveaux'] = df.apply(_nb_niveaux, axis=1)

    tau = 20
    def _pe(n):
        if n <= tau:
            return 1
        return max(1, int(np.ceil((n - tau) / 60.0)))
    df['Pe'] = df['_Ne'].apply(_pe)

    def _me(row):
        multigrade = _is_oui(row.get(COL_ETAB_MULTIGRADE, ''))
        nb_niv = int(row.get('_nb_niveaux', 6) or 6)
        if multigrade:
            return max(1, int(np.ceil(nb_niv / 2.0)))
        return max(1, nb_niv)
    df['me'] = df.apply(_me, axis=1)

    df['De'] = df[['Pe', 'me']].max(axis=1)
    df['BMAX'] = df['_SSF'] + 2 * df['_SDF']

    df['Ke'] = df[['De', 'BMAX']].min(axis=1)
    df['be'] = (df['Ke'] - df['_Ee']).clip(lower=0)
    df['xe'] = (df['_Ee'] - df['De']).clip(lower=0)
    df['se'] = (df['De'] - df['BMAX']).clip(lower=0)
    df['ae'] = (df[['_Ee', 'De']].min(axis=1) - df['BMAX']).clip(lower=0)

    def _alpha(row):
        acc = _str_norm(row.get(COL_ETAB_ALPHA, ''))
        if 'enclav' in acc: return 20
        if 'rural' in acc: return 15
        if 'semi' in acc: return 10
        if 'urbain' in acc: return 5
        return 0

    def _sigma(row):
        sec = _str_norm(row.get(COL_ETAB_SIGMA, ''))
        if 'rouge' in sec: return 25
        if 'jaune' in sec: return 10
        if 'verte' in sec or 'vert' in sec: return 0
        return 0

    df['alpha'] = df.apply(_alpha, axis=1)
    df['sigma'] = df.apply(_sigma, axis=1)
    t1 = cfg["vulnerabilite"]["t1"]
    t2 = cfg["vulnerabilite"]["t2"]
    df['Wp'] = t1 * df['alpha'] + t2 * df['sigma']

    def _beta(row):
        ne = row['_Ne']; ee = row['_Ee']
        if ee <= 0:
            return 15
        rem = ne / ee
        if rem <= 80: return 0
        if rem <= 100: return 5
        if rem <= 150: return 10
        return 15
    df['beta'] = df.apply(_beta, axis=1)
    df['Up'] = df['Wp'] + df['beta']

    def _niveau(w):
        if w >= 30: return 1
        if w >= 15: return 2
        return 3
    df['niveau_difficulte'] = df['Wp'].apply(_niveau)

    df['nb_postes_ouverts'] = df['be'].astype(int)
    df['est_necessiteuse'] = df['be'] > 0
    df['est_excedentaire'] = df['xe'] > 0
    df['est_zone_rouge'] = df[COL_ETAB_SIGMA].apply(lambda x: 'rouge' in _str_norm(x))

    return df


def nettoyer_enseignants(ens: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    df = ens.copy()
    age_retraite = cfg["seuils"].get("age_retraite_ans", 60)

    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].astype(str).str.strip()

    if COL_ENS_ID not in df.columns:
        raise ValueError(f"Colonne obligatoire manquante : {COL_ENS_ID}")
    df[COL_ENS_ID] = df[COL_ENS_ID].astype(str).str.strip()

    if COL_ENS_SS not in df.columns:
        df[COL_ENS_SS] = "Francophone"

    if COL_ENS_AGE in df.columns:
        df['_age'] = pd.to_numeric(df[COL_ENS_AGE], errors='coerce')
    else:
        df['_age'] = 35.0

    for col, defaut in [
        (COL_ENS_ANC_CAR, 0),
        (COL_ENS_ANC_POSTE, 0),
        (COL_ENS_N1, 0),
        (COL_ENS_N2, 0),
        (COL_ENS_ENFANTS, 0),
        (COL_ENS_FORM, 0),
    ]:
        if col in df.columns:
            df[f'_{col}'] = pd.to_numeric(df[col], errors='coerce').fillna(defaut)
        else:
            df[f'_{col}'] = defaut
    df = df[df['_age'] < age_retraite].copy()

    for col in (COL_ENS_V1, COL_ENS_V2, COL_ENS_V3):
        if col not in df.columns:
            df[col] = ""
        df[col] = df[col].astype(str).apply(
            lambda x: "" if _is_vide(x) else str(x).strip()
        )

    if COL_ENS_MOTIF not in df.columns:
        df[COL_ENS_MOTIF] = ""

    if COL_ENS_ETAB not in df.columns:
        df[COL_ENS_ETAB] = ""
    df[COL_ENS_ETAB] = df[COL_ENS_ETAB].astype(str).str.strip()

    return df.reset_index(drop=True)


def enrichir_enseignants_via_etab(ens: pd.DataFrame, etab: pd.DataFrame) -> pd.DataFrame:
    df = ens.copy()

    if etab.empty:
        for c in ("commune_attache", "departement_attache", "region_attache",
                  "iaeb_attache", "zone_attache", "alpha_attache", "sigma_attache",
                  "etab_attache_excedentaire"):
            df[c] = ""
        return df

    etab_map = etab.set_index(COL_ETAB_ID)

    def _lookup(id_etab, field, default=""):
        try:
            return etab_map.at[id_etab, field]
        except (KeyError, Exception):
            return default

    df['commune_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, COL_ETAB_COMMUNE, ""))
    df['departement_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, COL_ETAB_DEPT, ""))
    df['region_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, COL_ETAB_REGION, ""))
    df['iaeb_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, COL_ETAB_IAEB, ""))
    df['zone_attache'] = df[COL_ENS_ETAB].apply(
        lambda x: _lookup(x, COL_ETAB_ALPHA, _lookup(x, COL_ETAB_SIGMA, ""))
    )
    df['alpha_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, 'alpha', 0))
    df['sigma_attache'] = df[COL_ENS_ETAB].apply(lambda x: _lookup(x, 'sigma', 0))
    df['etab_attache_excedentaire'] = df[COL_ENS_ETAB].apply(
        lambda x: bool(_lookup(x, 'est_excedentaire', False))
    )
    return df


def enrichir_etablissements(etab: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    df = calculer_indicateurs_mathematiques(etab, cfg)

    if COL_ETAB_ID not in df.columns:
        raise ValueError(f"Colonne obligatoire manquante : {COL_ETAB_ID}")
    df[COL_ETAB_ID] = df[COL_ETAB_ID].astype(str).str.strip()

    if COL_ETAB_SS not in df.columns:
        df[COL_ETAB_SS] = "Francophone"
    df[COL_ETAB_SS] = df[COL_ETAB_SS].astype(str).str.strip()

    return df


# ============================================================
# BARÈMES & SCORES D'APPARIEMENT
# ============================================================

def points_situation(situation: str, cfg: dict) -> float:
    s = _str_norm(situation)
    if 'mari' in s: return float(cfg["points_situation_familiale"]["marie"])
    if 'divorc' in s: return float(cfg["points_situation_familiale"]["divorce"])
    if 'veuf' in s or 'veuve' in s: return float(cfg["points_situation_familiale"]["veuf"])
    return float(cfg["points_situation_familiale"]["celibataire"])


def calculer_bareme_individuel(row: pd.Series, cfg: dict) -> float:
    w = cfg["poids_bareme_individuel"]
    seuils = cfg["seuils"]

    anc_car = float(row.get('_' + COL_ENS_ANC_CAR, 0) or 0)
    n1 = float(row.get('_' + COL_ENS_N1, 0) or 0)
    n2 = float(row.get('_' + COL_ENS_N2, 0) or 0)
    if n1 == 0 and n2 == 0:
        z = _str_norm(row.get("zone_attache", ""))
        if "enclav" in z or "rouge" in z:
            n1 = anc_car
        elif "rural" in z or "jaune" in z:
            n2 = anc_car
    facteur_zone = max(10.0, 2.0 * n1 + 1.0 * n2)
    C1 = anc_car * facteur_zone

    anc_poste = float(row.get('_' + COL_ENS_ANC_POSTE, 0) or 0)
    C2 = 0.0
    if anc_poste >= 5:
        C2 = 5.0 + max(0.0, anc_poste - 5.0)
    age = float(row.get('_age', 35) or 35)
    age_retraite = seuils.get("age_retraite_ans", 60)
    if age >= (age_retraite - 5):
        C2 -= 5.0

    sit = points_situation(row.get(COL_ENS_SITU, ""), cfg)
    enfants = float(row.get('_' + COL_ENS_ENFANTS, 0) or 0)
    C3 = sit - 2.0 * enfants

    formation = float(row.get('_' + COL_ENS_FORM, 0) or 0)
    C4 = min(10.0, formation * 2.0)

    if age < seuils["age_jeune_ans"]:
        C5 = 10.0
    elif age < seuils["age_senior_ans"]:
        C5 = 8.0
    else:
        C5 = 5.0

    score = (w["C1_carriere_zone"] * C1
             + w["C2_anciennete_poste"] * C2
             + w["C3_charges_familiales"] * C3
             + w["C4_formation_continue"] * C4
             + w["C5_cohorte_age"] * C5)
    return round(float(score), 4)


def score_proximite(ens_row: pd.Series, etab_row: pd.Series, cfg: dict) -> float:
    pts = cfg["points_proximite"]
    c1 = _str_norm(ens_row.get("commune_attache", ""))
    c2 = _str_norm(etab_row.get(COL_ETAB_COMMUNE, ""))
    if c1 and c1 == c2:
        return float(pts["meme_commune"])
    d1 = _str_norm(ens_row.get("departement_attache", ""))
    d2 = _str_norm(etab_row.get(COL_ETAB_DEPT, ""))
    if d1 and d1 == d2:
        return float(pts["meme_departement"])
    return float(pts["autre"])


def ajustements_contextuels(ens_row: pd.Series, etab_row: pd.Series, cfg: dict) -> float:
    pts = 0.0
    age = float(ens_row.get('_age', 35) or 35)
    seuils = cfg["seuils"]
    ajust = cfg["ajustements_contextuels"]

    multigrade = _is_oui(etab_row.get(COL_ETAB_MULTIGRADE, ''))
    type_etab = str(etab_row.get("type_etab", "")).upper()

    if age <= seuils["age_jeune_ans"] and multigrade:
        pts += ajust["appui_multigrades_jeune"]

    if age >= seuils["age_senior_ans"] and type_etab in ["IAEB", "DREB", "DELEGATION"]:
        pts += ajust["senior_vers_encadrement"]

    if age >= seuils["age_senior_ans"] and not multigrade and type_etab not in ["IAEB", "DREB"]:
        pts += ajust["allegement_senior_standard"]

    z_from = _str_norm(ens_row.get("zone_attache", ""))
    z_to = _str_norm(etab_row.get(COL_ETAB_ALPHA, ""))
    anc = float(ens_row.get('_' + COL_ENS_ANC_POSTE, 0) or 0)
    if "rural" in z_from and ("urbain" in z_to or "semi" in z_to) and anc >= 5:
        pts += ajust["transition_rural_urbain"]

    motif = str(ens_row.get(COL_ENS_MOTIF, "")).strip()
    if not _is_vide(motif):
        id_etab_poste = str(etab_row.get(COL_ETAB_ID, "")).strip()
        voeux = [
            str(ens_row.get(COL_ENS_V1, "")).strip(),
            str(ens_row.get(COL_ENS_V2, "")).strip(),
            str(ens_row.get(COL_ENS_V3, "")).strip(),
        ]
        voeux = [v for v in voeux if not _is_vide(v)]
        cible_explicite = None
        for v in voeux:
            if v and v.lower() in motif.lower():
                cible_explicite = v
                break
        if cible_explicite:
            if id_etab_poste == cible_explicite:
                pts += ajust["bonification_ciblee"]
        elif id_etab_poste in voeux:
            pts += ajust["bonification_ciblee"]

    return float(pts)


def score_enseignant_poste(ens_row: pd.Series, etab_row: pd.Series, cfg: dict) -> float:
    w = cfg["poids_score_appariement"]
    bareme = float(ens_row.get("bareme", 0) or 0)
    up = float(etab_row.get("Up", 0) or 0)
    prox = score_proximite(ens_row, etab_row, cfg)
    ajust = ajustements_contextuels(ens_row, etab_row, cfg)
    return round(
        w["Z1_bareme_individu"] * bareme
        + w["Z2_poids_poste_Up"] * up
        + w["Z3_proximite"] * prox
        + w["Z4_ajustements"] * ajust,
        4
    )


# ============================================================
# CONSTRUCTION POSTES & VIVIER
# ============================================================

def construire_postes(etab: pd.DataFrame) -> pd.DataFrame:
    rows = []
    lat_col = next((c for c in etab.columns if c.lower() in ["latitude", "lat"]), None)
    lon_col = next((c for c in etab.columns if c.lower() in ["longitude", "lon", "lng"]), None)

    for _, r in etab.iterrows():
        n = int(r.get("nb_postes_ouverts", 0) or 0)
        for k in range(n):
            post = {
                "id_poste": f"{r[COL_ETAB_ID]}_P{k+1}",
                COL_ETAB_ID: str(r[COL_ETAB_ID]),
                "nom_etab": r.get("nom_etab", r.get(COL_ETAB_ID, "")),
                COL_ETAB_COMMUNE: r.get(COL_ETAB_COMMUNE, ""),
                COL_ETAB_DEPT: r.get(COL_ETAB_DEPT, ""),
                COL_ETAB_REGION: r.get(COL_ETAB_REGION, ""),
                COL_ETAB_IAEB: r.get(COL_ETAB_IAEB, ""),
                COL_ETAB_ALPHA: r.get(COL_ETAB_ALPHA, ""),
                COL_ETAB_SIGMA: r.get(COL_ETAB_SIGMA, ""),
                COL_ETAB_MULTIGRADE: r.get(COL_ETAB_MULTIGRADE, ""),
                COL_ETAB_SS: str(r.get(COL_ETAB_SS, "Francophone")).strip(),
                "type_etab": str(r.get("type_etab", "ECOLE")),
                "Up": float(r.get("Up", 0) or 0),
                "Wp": float(r.get("Wp", 0) or 0),
                "est_zone_rouge": bool(r.get("est_zone_rouge", False)),
                "pourvu": False,
            }
            if lat_col and pd.notna(r.get(lat_col)):
                post["latitude"] = pd.to_numeric(r[lat_col], errors="coerce")
            if lon_col and pd.notna(r.get(lon_col)):
                post["longitude"] = pd.to_numeric(r[lon_col], errors="coerce")
            rows.append(post)
    return pd.DataFrame(rows)


def construire_vivier(ens: pd.DataFrame, etab_enrichi: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    df = ens.copy()
    if df.empty:
        df["bareme"] = []
        df["affecte"] = []
        return df

    df["bareme"] = df.apply(lambda r: calculer_bareme_individuel(r, cfg), axis=1)

    seuil_anc = int(cfg["seuils"]["anciennete_poste_recevabilite_ans"])
    df['_' + COL_ENS_ANC_POSTE] = pd.to_numeric(df['_' + COL_ENS_ANC_POSTE], errors='coerce').fillna(0)
    df[COL_ENS_ETAB] = df[COL_ENS_ETAB].astype(str).str.strip()

    ecoles_exc_data = etab_enrichi[etab_enrichi["xe"] > 0][[COL_ETAB_ID, "xe"]].copy()
    ecoles_exc_data[COL_ETAB_ID] = ecoles_exc_data[COL_ETAB_ID].astype(str).str.strip()
    dict_excedent = dict(zip(ecoles_exc_data[COL_ETAB_ID], ecoles_exc_data["xe"]))

    vivier_valide_indices = []

    for id_ecole, quota_xe in dict_excedent.items():
        candidats_ecole = df[(df[COL_ENS_ETAB] == id_ecole) & (df['_' + COL_ENS_ANC_POSTE] >= seuil_anc)]
        if not candidats_ecole.empty:
            candidats_ecole = candidats_ecole.sort_values(by="bareme", ascending=False)
            retenus = candidats_ecole.head(int(quota_xe))
            vivier_valide_indices.extend(retenus.index.tolist())

    df = df.loc[vivier_valide_indices].copy()

    if df.empty:
        df["bareme"] = []
        df["affecte"] = []
        return df

    df['_' + COL_ENS_ANC_CAR] = pd.to_numeric(df['_' + COL_ENS_ANC_CAR], errors='coerce').fillna(0)
    df['_age_sort'] = pd.to_numeric(df['_age'], errors='coerce').fillna(0)
    df = df.sort_values(
        by=["bareme", '_' + COL_ENS_ANC_CAR, '_age_sort'],
        ascending=[False, False, False]
    ).reset_index(drop=True)

    df["affecte"] = False
    return df


def postes_disponibles(postes: pd.DataFrame) -> pd.DataFrame:
    return postes[~postes["pourvu"]].copy() if not postes.empty else postes


def enseignants_disponibles(vivier: pd.DataFrame) -> pd.DataFrame:
    return vivier[~vivier["affecte"]].copy() if not vivier.empty else vivier


def _filtre_sous_systeme(cands: pd.DataFrame, ens_row: pd.Series) -> pd.DataFrame:
    if cands.empty:
        return cands
    ens_ss = _str_norm(ens_row.get(COL_ENS_SS, ""))
    if not ens_ss:
        return cands
    return cands[cands[COL_ETAB_SS].apply(lambda x: _str_norm(x) == ens_ss)]


def _filtre_zone_rouge(cands: pd.DataFrame, autoriser_voeu_exprès: bool) -> pd.DataFrame:
    if cands.empty:
        return cands
    if autoriser_voeu_exprès:
        return cands
    return cands[~cands["est_zone_rouge"].astype(bool)]


def choisir_meilleur_poste(
    ens_row: pd.Series,
    candidats: pd.DataFrame,
    cfg: dict,
    contrainte_commune: bool = False,
    contrainte_dept: bool = False,
    contrainte_iaeb: bool = False,
    autoriser_zone_rouge: bool = False,
) -> Optional[str]:
    if candidats.empty:
        return None

    cdf = candidats.copy()
    cdf = _filtre_sous_systeme(cdf, ens_row)
    cdf = _filtre_zone_rouge(cdf, autoriser_zone_rouge)

    if contrainte_commune:
        c = _str_norm(ens_row.get("commune_attache", ""))
        if c:
            cdf = cdf[cdf[COL_ETAB_COMMUNE].apply(lambda x: _str_norm(x) == c)]
    if contrainte_dept:
        d = _str_norm(ens_row.get("departement_attache", ""))
        if d:
            cdf = cdf[cdf[COL_ETAB_DEPT].apply(lambda x: _str_norm(x) == d)]
    if contrainte_iaeb:
        i = _str_norm(ens_row.get("iaeb_attache", ""))
        if i:
            cdf = cdf[cdf[COL_ETAB_IAEB].apply(lambda x: _str_norm(x) == i)]

    if cdf.empty:
        return None

    scores = []
    for _, p in cdf.iterrows():
        sc = score_enseignant_poste(ens_row, p, cfg)
        scores.append((sc, p["id_poste"]))
    scores.sort(key=lambda x: x[0], reverse=True)
    return scores[0][1]


def _construire_aff_item(
    ens_row: pd.Series, poste_row: pd.Series, cfg: dict,
    phase: str, motif: str = "", arbitrage: str = "",
) -> dict:
    sc = score_enseignant_poste(ens_row, poste_row, cfg)
    item = {
        "phase": phase,
        "id_poste": poste_row["id_poste"],
        "id_etab": poste_row[COL_ETAB_ID],
        "nom_etab": poste_row.get("nom_etab", ""),
        "commune_poste": poste_row.get(COL_ETAB_COMMUNE, ""),
        "departement_poste": poste_row.get(COL_ETAB_DEPT, ""),
        "region_poste": poste_row.get(COL_ETAB_REGION, ""),
        "zone_poste": poste_row.get(COL_ETAB_ALPHA, ""),
        "sous_systeme": poste_row.get(COL_ETAB_SS, ""),
        "id_ens": ens_row.get(COL_ENS_ID, ""),
        "nom_ens": ens_row.get("nom", ""),
        "prenom_ens": ens_row.get("prenom", ""),
        "commune_origine": ens_row.get("commune_attache", ""),
        "departement_origine": ens_row.get("departement_attache", ""),
        "sous_systeme_ens": ens_row.get(COL_ENS_SS, ""),
        "bareme": ens_row.get("bareme", 0),
        "score_affectation": sc,
        "age": ens_row.get('_age', None),
        "anciennete_poste_ans": ens_row.get('_' + COL_ENS_ANC_POSTE, 0),
        "anciennete_carriere_ans": ens_row.get('_' + COL_ENS_ANC_CAR, 0),
        "motif_derogation": motif,
        "arbitrage": arbitrage,
    }
    for c in ("latitude", "longitude"):
        if c in poste_row and pd.notna(poste_row[c]):
            item[c] = poste_row[c]
    return item


def affecter_phase1_voeux(vivier: pd.DataFrame, postes: pd.DataFrame, cfg: dict) -> List[dict]:
    affectations: List[dict] = []
    if vivier.empty or postes.empty:
        return affectations

    ens_dispo = enseignants_disponibles(vivier)
    candidatures_postes = {}

    for i, ens_row in ens_dispo.iterrows():
        for num_voeu, col_voeu in enumerate([COL_ENS_V1, COL_ENS_V2, COL_ENS_V3], 1):
            id_etab_voeu = str(ens_row.get(col_voeu, "")).strip()
            if _is_vide(id_etab_voeu):
                continue

            postes_libres = postes[
                (~postes["pourvu"])
                & (postes[COL_ETAB_ID].astype(str).str.strip() == id_etab_voeu)
            ]
            postes_libres = _filtre_sous_systeme(postes_libres, ens_row)
            postes_libres = _filtre_zone_rouge(postes_libres, autoriser_voeu_exprès=True)

            if postes_libres.empty:
                continue

            p = postes_libres.iloc[0]
            id_poste = p["id_poste"]
            score_ep = score_enseignant_poste(ens_row, p, cfg)

            if id_poste not in candidatures_postes:
                candidatures_postes[id_poste] = []
            
            candidatures_postes[id_poste].append((score_ep, i, ens_row, col_voeu))

    for id_poste, liste_candidats in candidatures_postes.items():
        if postes.loc[postes["id_poste"] == id_poste, "pourvu"].values[0]:
             continue
             
        liste_candidats.sort(key=lambda x: x[0], reverse=True)

        for score_ep, i, ens_row, col_voeu in liste_candidats:
            if not vivier.at[i, "affecte"]:
                vivier.at[i, "affecte"] = True
                postes.loc[postes["id_poste"] == id_poste, "pourvu"] = True
                p = postes[postes["id_poste"] == id_poste].iloc[0]
                
                affectations.append(
                    _construire_aff_item(ens_row, p, cfg, f"phase1_voeu_{col_voeu[-1]}",
                                         arbitrage="voeu_satisfait")
                )
                break

    return affectations


def affecter_par_proximite(
    vivier: pd.DataFrame, postes: pd.DataFrame, cfg: dict,
    phase: str,
    contrainte_commune: bool = False,
    contrainte_dept: bool = False,
    contrainte_iaeb: bool = False,
    autoriser_zone_rouge: bool = False,
) -> List[dict]:
    affectations: List[dict] = []
    if vivier.empty or postes.empty:
        return affectations

    ens_dispo = enseignants_disponibles(vivier)
    ens_dispo = ens_dispo.sort_values("bareme", ascending=False)

    for i, ens_row in ens_dispo.iterrows():
        if vivier.at[i, "affecte"]:
            continue
        cands = postes_disponibles(postes)
        id_poste = choisir_meilleur_poste(
            ens_row, cands, cfg,
            contrainte_commune=contrainte_commune,
            contrainte_dept=contrainte_dept,
            contrainte_iaeb=contrainte_iaeb,
            autoriser_zone_rouge=autoriser_zone_rouge,
        )
        if not id_poste:
            continue

        vivier.at[i, "affecte"] = True
        postes.loc[postes["id_poste"] == id_poste, "pourvu"] = True
        p = postes[postes["id_poste"] == id_poste].iloc[0]
        affectations.append(
            _construire_aff_item(ens_row, p, cfg, phase,
                                 arbitrage="recherche_proximite")
        )
    return affectations


def run_affectation(
    etab: pd.DataFrame, ens: pd.DataFrame, cfg: dict,
    affectations_prince: Optional[List[dict]] = None,
) -> dict:
    etab = enrichir_etablissements(etab, cfg)
    ens = nettoyer_enseignants(ens, cfg)
    ens = enrichir_enseignants_via_etab(ens, etab)

    postes = construire_postes(etab)
    vivier = construire_vivier(ens, etab, cfg)

    all_aff: List[dict] = []
    journal_audit: List[dict] = []

    # PHASE 0 : FAIT DU PRINCE
    if affectations_prince and not vivier.empty:
        for item in affectations_prince:
            ens_id = str(item.get("id_ens", "")).strip()
            etab_id = str(item.get("id_etab", "")).strip()
            motif = item.get("motif", "Décision de l'autorité (Effet de prince)")

            if not ens_id or not etab_id:
                continue

            idx_ens = vivier.index[
                vivier[COL_ENS_ID].astype(str).str.strip() == ens_id]
            if len(idx_ens) == 0:
                journal_audit.append({
                    "timestamp": datetime.now().isoformat(),
                    "phase": "effet_de_prince",
                    "id_ens": ens_id, "id_etab": etab_id,
                    "statut": "REJETE",
                    "motif": f"Enseignant introuvable dans le vivier ({motif})",
                })
                continue
            i_ens = idx_ens[0]

            if vivier.at[i_ens, "affecte"]:
                journal_audit.append({
                    "timestamp": datetime.now().isoformat(),
                    "phase": "effet_de_prince",
                    "id_ens": ens_id, "id_etab": etab_id,
                    "statut": "REJETE",
                    "motif": "Enseignant déjà affecté",
                })
                continue

            ens_row = vivier.loc[i_ens]

            cands = postes[
                (~postes["pourvu"])
                & (postes[COL_ETAB_ID].astype(str).str.strip() == etab_id)
            ]
            if not cands.empty:
                id_poste = cands.iloc[0]["id_poste"]
                postes.loc[postes["id_poste"] == id_poste, "pourvu"] = True
                p = postes[postes["id_poste"] == id_poste].iloc[0]
            else:
                etab_match = etab[etab[COL_ETAB_ID].astype(str).str.strip() == etab_id]
                id_poste = f"{etab_id}_P_PRINCE_{len(all_aff)+1}"
                lat_c = next((c for c in etab.columns if c.lower() in ["latitude", "lat"]), None)
                lon_c = next((c for c in etab.columns if c.lower() in ["longitude", "lon", "lng"]), None)
                base = etab_match.iloc[0] if not etab_match.empty else None
                nouveau = {
                    "id_poste": id_poste,
                    COL_ETAB_ID: etab_id,
                    "nom_etab": base.get(COL_ETAB_ID, "") if base is not None else "",
                    COL_ETAB_COMMUNE: base.get(COL_ETAB_COMMUNE, "") if base is not None else "",
                    COL_ETAB_DEPT: base.get(COL_ETAB_DEPT, "") if base is not None else "",
                    COL_ETAB_REGION: base.get(COL_ETAB_REGION, "") if base is not None else "",
                    COL_ETAB_IAEB: base.get(COL_ETAB_IAEB, "") if base is not None else "",
                    COL_ETAB_ALPHA: base.get(COL_ETAB_ALPHA, "") if base is not None else "",
                    COL_ETAB_SIGMA: base.get(COL_ETAB_SIGMA, "") if base is not None else "",
                    COL_ETAB_MULTIGRADE: base.get(COL_ETAB_MULTIGRADE, "") if base is not None else "",
                    COL_ETAB_SS: base.get(COL_ETAB_SS, "") if base is not None else "",
                    "type_etab": base.get("type_etab", "ECOLE") if base is not None else "ECOLE",
                    "Up": 0.0, "Wp": 0.0,
                    "est_zone_rouge": False,
                    "pourvu": True,
                }
                if base is not None and lat_c and pd.notna(base.get(lat_c)):
                    nouveau["latitude"] = pd.to_numeric(base[lat_c], errors="coerce")
                if base is not None and lon_c and pd.notna(base.get(lon_c)):
                    nouveau["longitude"] = pd.to_numeric(base[lon_c], errors="coerce")
                postes = pd.concat([postes, pd.DataFrame([nouveau])], ignore_index=True)
                p = pd.Series(nouveau)

            vivier.at[i_ens, "affecte"] = True
            all_aff.append(
                _construire_aff_item(ens_row, p, cfg, "effet_de_prince",
                                     motif=motif, arbitrage="fait_du_prince")
            )
            journal_audit.append({
                "timestamp": datetime.now().isoformat(),
                "phase": "effet_de_prince",
                "id_ens": ens_id, "id_etab": etab_id, "id_poste": id_poste,
                "statut": "FAIT_DU_PRINCE", "motif": motif,
            })

    besoin = len(postes)
    dispo = len(vivier)

    # PHASE 1 : VŒUX
    if cfg["regles_dreb"].get("phase1_voeux_actif", True):
        aff_p1 = affecter_phase1_voeux(vivier, postes, cfg)
        all_aff += aff_p1
        for a in aff_p1:
            journal_audit.append({
                "timestamp": datetime.now().isoformat(),
                "phase": a["phase"], "id_ens": a["id_ens"],
                "id_etab": a["id_etab"], "id_poste": a["id_poste"],
                "statut": "VALIDE", "motif": "Vœu satisfait",
            })

    # PHASE 2 : PROXIMITÉ
    if cfg["regles_dreb"].get("phase2_proximite_iaeb", True):
        aff = affecter_par_proximite(vivier, postes, cfg,
                                     "phase2_proximite_iaeb", contrainte_iaeb=True)
        all_aff += aff
        for a in aff:
            journal_audit.append({
                "timestamp": datetime.now().isoformat(),
                "phase": a["phase"], "id_ens": a["id_ens"],
                "id_etab": a["id_etab"], "id_poste": a["id_poste"],
                "statut": "VALIDE", "motif": "Proximité IAEB",
            })

    if cfg["regles_dreb"].get("phase2_proximite_departement", True):
        aff = affecter_par_proximite(vivier, postes, cfg,
                                     "phase2_proximite_departement",
                                     contrainte_dept=True)
        all_aff += aff
        for a in aff:
            journal_audit.append({
                "timestamp": datetime.now().isoformat(),
                "phase": a["phase"], "id_ens": a["id_ens"],
                "id_etab": a["id_etab"], "id_poste": a["id_poste"],
                "statut": "VALIDE", "motif": "Proximité département",
            })

    # PHASE 3 : EXTENSION RÉGIONALE
    if cfg["regles_dreb"].get("phase3_extension_regionale", True):
        aff = affecter_par_proximite(vivier, postes, cfg,
                                     "phase3_extension_regionale",
                                     autoriser_zone_rouge=False)
        all_aff += aff
        for a in aff:
            journal_audit.append({
                "timestamp": datetime.now().isoformat(),
                "phase": a["phase"], "id_ens": a["id_ens"],
                "id_etab": a["id_etab"], "id_poste": a["id_poste"],
                "statut": "VALIDE", "motif": "Extension régionale",
            })

    # PHASE 4 : SYNTHÈSE ET PROJECTIONS
    non_affectes = vivier[~vivier["affecte"]].copy() if not vivier.empty else vivier.copy()
    postes_non_pourvus = postes[~postes["pourvu"]].copy() if not postes.empty else postes.copy()

    rt_par_ss: Dict[str, int] = {}
    for ss in postes_non_pourvus[COL_ETAB_SS].unique():
        rt_par_ss[str(ss)] = int((postes_non_pourvus[COL_ETAB_SS] == ss).sum())

    postes_rouge = postes_non_pourvus[postes_non_pourvus["est_zone_rouge"].astype(bool)]
    a_recruter = len(postes_non_pourvus)

    cols_ecole = [COL_ETAB_ID, COL_ETAB_SS, COL_ETAB_REGION, COL_ETAB_DEPT,
                  COL_ETAB_COMMUNE, COL_ETAB_IAEB, COL_ETAB_ALPHA, COL_ETAB_SIGMA,
                  "nb_postes_ouverts", "Up", "De", "BMAX", "Pe", "xe", "se"]
    cols_ok = [c for c in cols_ecole if c in etab.columns]
    for c in ("latitude", "longitude"):
        cc = next((x for x in etab.columns if x.lower() == c), None)
        if cc: cols_ok.append(cc)
    ecoles_besoin = etab[etab["est_necessiteuse"]][list(set(cols_ok))].copy()

    if not vivier.empty and COL_ENS_ETAB in vivier.columns:
        fournisseurs = (
            vivier.groupby([COL_ENS_ETAB], dropna=False)
            .size().reset_index(name="nb_enseignants_vivier")
            .rename(columns={COL_ENS_ETAB: COL_ETAB_ID})
        )
    else:
        fournisseurs = pd.DataFrame(columns=[COL_ETAB_ID, "nb_enseignants_vivier"])

    aff_df = pd.DataFrame(all_aff)
    nb_prince = int((aff_df["phase"] == "effet_de_prince").sum()) if not aff_df.empty and "phase" in aff_df.columns else 0

    projections_df = generer_projections_n3(etab, vivier, aff_df)
    journal_df = pd.DataFrame(journal_audit)
    stats_phase = aff_df["phase"].value_counts().to_dict() if not aff_df.empty else {}

    return {
        "synthese": {
            "besoin_total": besoin,
            "disponibles": dispo,
            "affectes": len(all_aff),
            "effet_de_prince": nb_prince,
            "non_affectes": len(non_affectes),
            "postes_non_pourvus": len(postes_non_pourvus),
            "a_recruter": a_recruter,
            "rt_par_sous_systeme": rt_par_ss,
            "postes_rouge_non_pourvus": len(postes_rouge),
            "stats_phase": stats_phase,
        },
        "ecoles_en_besoin": ecoles_besoin,
        "ecoles_fournisseurs": fournisseurs,
        "affectations": aff_df,
        "non_affectes": non_affectes,
        "postes_non_pourvus": postes_non_pourvus,
        "postes_rouge_non_pourvus": postes_rouge,
        "vivier": vivier,
        "etab_enrichi": etab,
        "projections_n3": projections_df,
        "journal_audit": journal_df,
    }


def generer_projections_n3(etab_df: pd.DataFrame,
                           vivier_df: pd.DataFrame,
                           aff_df: pd.DataFrame) -> pd.DataFrame:
    proj = []
    age_retraite = 60
    taux_attrition = 0.02

    for _, r in etab_df.iterrows():
        id_etab = str(r.get(COL_ETAB_ID, "N/A"))

        arrivants = aff_df[aff_df['id_etab'] == id_etab]["id_ens"].tolist() if not aff_df.empty else []
        arrivants_str = ", ".join([str(a) for a in arrivants]) if arrivants else "N/A"

        ens_initial = vivier_df[vivier_df[COL_ENS_ETAB] == id_etab] if COL_ENS_ETAB in vivier_df.columns else pd.DataFrame()

        sortants = []
        if not ens_initial.empty and not aff_df.empty:
            ids_arr = set(arrivants)
            sortants = ens_initial[
                (ens_initial[COL_ENS_ID].isin(aff_df["id_ens"]))
                & (~ens_initial[COL_ENS_ID].isin(ids_arr))
            ][COL_ENS_ID].tolist()
        sortants_str = ", ".join([str(s) for s in sortants]) if sortants else "N/A"

        retraite_n1 = retraite_n2 = retraite_n3 = 0
        if not ens_initial.empty and '_age' in ens_initial.columns:
            ages = pd.to_numeric(ens_initial['_age'], errors='coerce').fillna(0)
            retraite_n1 = int((ages >= (age_retraite - 1)).sum())
            retraite_n2 = int((ages == (age_retraite - 2)).sum())
            retraite_n3 = int((ages == (age_retraite - 3)).sum())

        eff_n = float(r.get('_Ee', 0) or 0)
        eff_projet = eff_n + len(arrivants) - len(sortants)
        attrition_n1 = int(np.ceil(max(0, eff_projet) * taux_attrition))
        attrition_n2 = int(np.ceil(max(0, eff_projet - retraite_n1) * taux_attrition))
        attrition_n3 = int(np.ceil(max(0, eff_projet - retraite_n1 - retraite_n2) * taux_attrition))

        besoin_n = int(r.get('be', 0) or 0)
        rt_n = max(0, besoin_n - len(arrivants))

        besoin_n1 = max(0, float(r.get('Ke', 0) or 0) - (eff_projet - retraite_n1 - attrition_n1))
        quota_n2 = max(0, besoin_n1 + retraite_n2 + attrition_n2)
        quota_n3 = max(0, quota_n2 + retraite_n3 + attrition_n3)

        proj.append({
            "Identifiant_Ecole": id_etab,
            "Sous_Systeme": str(r.get(COL_ETAB_SS, 'Francophone')),
            "Poids_Du_Poste (Up)": round(float(r.get('Up', 0) or 0), 2),
            "Capacite_Physique (BMAX)": int(r.get('BMAX', 0) or 0),
            "Dotation_Theorique (De)": int(r.get('De', 0) or 0),
            "Besoin_Ouvert_N (be)": besoin_n,
            "Excedent_Mobilisable_N (xe)": int(r.get('xe', 0) or 0),
            "Enseignants_Arrivants_N": arrivants_str,
            "Enseignants_Sortants_N": sortants_str,
            "Salles_Manquantes_N (se)": int(r.get('se', 0) or 0),
            "Besoin_Residuel_Net_N (RT)": rt_n,
            "Departs_Retraite_N+1": retraite_n1,
            "Attrition_Previsible_N+1": attrition_n1,
            "Affectations_Differees_N+1": "N/A",
            "Besoin_Projete_N+1": int(besoin_n1),
            "Departs_Retraite_N+2": retraite_n2,
            "Projection_Vivier_N+2": "N/A",
            "Salles_Manquantes_Projetees_N+2": int(r.get('se', 0) or 0),
            "Quota_Recrutement_Estime_N+2": int(quota_n2),
            "Departs_Retraite_N+3": retraite_n3,
            "Attrition_Previsible_N+3": attrition_n3,
            "Besoin_Minimal_Completude_N+3": int(r.get('De', 0) or 0),
            "Quota_Recrutement_Estime_N+3": int(quota_n3),
        })
    return pd.DataFrame(proj)


def export_excel_bytes(resultat: dict) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame([resultat["synthese"]]).to_excel(
            writer, sheet_name="Synthese_Region", index=False)
        resultat["ecoles_en_besoin"].to_excel(
            writer, sheet_name="Ecoles_Necessiteuses", index=False)
        resultat["ecoles_fournisseurs"].to_excel(
            writer, sheet_name="Ecoles_Fournisseurs", index=False)
        resultat["affectations"].to_excel(
            writer, sheet_name="Affectations", index=False)

        aff = resultat["affectations"]
        if not aff.empty and "phase" in aff.columns:
            prince_df = aff[aff["phase"] == "effet_de_prince"]
            if not prince_df.empty:
                prince_df.to_excel(writer, sheet_name="Effet_De_Prince", index=False)

        resultat["non_affectes"].to_excel(writer, sheet_name="Non_Affectes", index=False)
        resultat["postes_non_pourvus"].to_excel(writer, sheet_name="Postes_Non_Pourvus", index=False)
        resultat["vivier"].to_excel(writer, sheet_name="Vivier_Detail", index=False)

        if "postes_rouge_non_pourvus" in resultat and not resultat["postes_rouge_non_pourvus"].empty:
            resultat["postes_rouge_non_pourvus"].to_excel(
                writer, sheet_name="Postes_Zone_Rouge", index=False)

        if "projections_n3" in resultat and not resultat["projections_n3"].empty:
            resultat["projections_n3"].to_excel(
                writer, sheet_name="Projections_N_a_N3", index=False)

        if "journal_audit" in resultat and not resultat["journal_audit"].empty:
            resultat["journal_audit"].to_excel(
                writer, sheet_name="Journal_Audit", index=False)
    buffer.seek(0)
    return buffer.getvalue()


# ============================================================
# MODULE IA DÉCISIONNEL
# ============================================================

def initialiser_client_ia(api_key: Optional[str] = None):
    try:
        from google import genai
        key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not key:
            return None
        return genai.Client(api_key=key)
    except Exception:
        return None


def generer_note_strategique_ia(client, synthese, etab_besoin, aff_df) -> str:
    nb_prince = int((aff_df["phase"] == "effet_de_prince").sum()) if not aff_df.empty and "phase" in aff_df.columns else 0
    top_depts = etab_besoin[COL_ETAB_DEPT].value_counts().head(5).to_dict() if COL_ETAB_DEPT in etab_besoin.columns else {}

    prompt = f"""
Tu es l'Expert Principal en Planification Scolaire et GRH au MINEDUB/PAREC.
Rédige une NOTE DE SYNTHÈSE STRATÉGIQUE pour Monsieur le Ministre.

DONNÉES :
- Besoin total : {synthese.get('besoin_total', 0)}
- Vivier : {synthese.get('disponibles', 0)}
- Affectés : {synthese.get('affectes', 0)}
- Effet de Prince : {nb_prince}
- Non affectés : {synthese.get('non_affectes', 0)}
- Postes résiduels : {synthese.get('a_recruter', 0)}
- R_T par sous-système : {synthese.get('rt_par_sous_systeme', {})}
- Top départements en tension : {top_depts}

STRUCTURE :
1. ÉTAT DES LIEUX GLOBAL
2. ANALYSE DES DISPARITÉS TERRITORIALES
3. OBSERVATION SUR LES AFFECTATIONS DÉROGATOIRES
4. RECOMMANDATIONS OPÉRATIONNELLES

Ton administratif et direct. Markdown.
"""
    try:
        r = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        return r.text
    except Exception as e:
        return f"Erreur IA : {e}"


def auditer_equite_et_derogations_ia(client, aff_df, besoin_df) -> str:
    if aff_df.empty or "phase" not in aff_df.columns:
        return "Aucune affectation disponible."
    prince_df = aff_df[aff_df["phase"] == "effet_de_prince"]
    if prince_df.empty:
        return "✅ Aucune dérogation « Effet de Prince » appliquée."
    resume = prince_df[["id_ens", "nom_etab", "commune_poste",
                        "departement_poste", "motif_derogation", "bareme"]
                       ].to_dict(orient="records")
    prompt = f"""
Tu es Auditeur Général. Analyse ces {len(prince_df)} dérogations :
{json.dumps(resume, ensure_ascii=False, indent=2)}

LIVRABLES :
1. Concentration géographique
2. Niveau de barème des bénéficiaires
3. Impact sur l'équité perçue
"""
    try:
        r = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        return r.text
    except Exception as e:
        return f"Erreur audit IA : {e}"


def interroger_copilot_ia(client, question, synthese, aff_df, etab_df) -> str:
    ctx = f"Synthèse : {json.dumps(synthese, ensure_ascii=False, default=str)}\nAffectations : {len(aff_df)}"
    prompt = f"Tu es l'assistant IA KoSIG.\nCONTEXTE :\n{ctx}\nQUESTION : {question}"
    try:
        r = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        return r.text
    except Exception as e:
        return f"Erreur Copilot : {e}"


# ============================================================
# THREADS DE CALCUL & IA EN ARRIÈRE-PLAN
# ============================================================

if HAS_PYSIDE6:
    class CalculationWorker(QThread):
        finished = Signal(dict)
        error = Signal(str)

        def __init__(self, etab_df: pd.DataFrame, ens_df: pd.DataFrame, cfg: dict, prince_list: List[dict]):
            super().__init__()
            self.etab_df = etab_df
            self.ens_df = ens_df
            self.cfg = cfg
            self.prince_list = prince_list

        def run(self):
            try:
                res = run_affectation(self.etab_df, self.ens_df, self.cfg,
                                      affectations_prince=self.prince_list)
                self.finished.emit(res)
            except Exception as e:
                self.error.emit(f"{e}\n\n{traceback.format_exc()}")


    class AIWorker(QThread):
        finished = Signal(str)
        error = Signal(str)

        def __init__(self, fn, *args):
            super().__init__()
            self.fn = fn
            self.args = args

        def run(self):
            try:
                res = self.fn(*self.args)
                self.finished.emit(res)
            except Exception as e:
                self.error.emit(str(e))


    # ============================================================
    # COMPOSANTS D'INTERFACE MODERNES (QSS & WIDGETS)
    # ============================================================

    DARK_STYLESHEET = """
    QMainWindow {
        background-color: #0b1523;
        color: #F8FAFC;
        font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
    }
    QWidget {
        color: #F8FAFC;
        font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
        font-size: 13px;
    }
    QScrollArea {
        border: none;
        background: transparent;
    }
    QScrollBar:vertical {
        border: none;
        background: #0d1a2d;
        width: 8px;
        margin: 0px;
        border-radius: 4px;
    }
    QScrollBar::handle:vertical {
        background: #254065;
        min-height: 25px;
        border-radius: 4px;
    }
    QScrollBar::handle:vertical:hover {
        background: #38bdf8;
    }
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
        height: 0px;
    }
    QScrollBar:horizontal {
        border: none;
        background: #0d1a2d;
        height: 8px;
        border-radius: 4px;
    }
    QScrollBar::handle:horizontal {
        background: #254065;
        min-width: 25px;
        border-radius: 4px;
    }
    QFrame.sidebar {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #12243d, stop:1 #0c1829);
        border-right: 1px solid rgba(255, 255, 255, 0.12);
    }
    QFrame.card {
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 12px;
    }
    QFrame.headerBox {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
    }
    QFrame.princeBox {
        background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
            stop:0 rgba(234, 179, 8, 0.12),
            stop:1 rgba(168, 85, 247, 0.12));
        border: 1px solid rgba(234, 179, 8, 0.35);
        border-radius: 12px;
    }
    QGroupBox {
        font-weight: 700;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        margin-top: 12px;
        padding-top: 14px;
        background: rgba(0, 0, 0, 0.15);
    }
    QGroupBox::title {
        subcontrol-origin: margin;
        subcontrol-position: top left;
        left: 10px;
        padding: 0 4px;
        color: #38bdf8;
    }
    QPushButton {
        background-color: #1e3a5f;
        border: 1px solid #38bdf8;
        color: #ffffff;
        padding: 7px 14px;
        border-radius: 8px;
        font-weight: 600;
    }
    QPushButton:hover {
        background-color: #2563eb;
        border-color: #60a5fa;
    }
    QPushButton:pressed {
        background-color: #1d4ed8;
    }
    QPushButton:disabled {
        background-color: #1a2533;
        border-color: #334155;
        color: #64748b;
    }
    QPushButton.primary {
        background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284c7, stop:1 #2563eb);
        border: 1px solid #38bdf8;
        color: #ffffff;
        font-weight: 700;
        font-size: 14px;
    }
    QPushButton.primary:hover {
        background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0369a1, stop:1 #1d4ed8);
        border: 1px solid #7dd3fc;
    }
    QLineEdit, QDoubleSpinBox {
        background-color: #0c1829;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 6px 10px;
        color: #ffffff;
        selection-background-color: #2563eb;
    }
    QLineEdit:focus, QDoubleSpinBox:focus {
        border: 1px solid #38bdf8;
    }
    QTabWidget::pane {
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 8px;
        background: #0d1a2d;
        top: -1px;
    }
    QTabBar::tab {
        background: #112239;
        border: 1px solid rgba(255, 255, 255, 0.10);
        padding: 8px 16px;
        margin-right: 4px;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
        font-weight: 600;
        color: #94a3b8;
    }
    QTabBar::tab:selected {
        background: #1e3a5f;
        border-bottom-color: #1e3a5f;
        color: #38bdf8;
        border-top: 2px solid #38bdf8;
    }
    QTabBar::tab:hover:!selected {
        background: #162c4a;
        color: #e2e8f0;
    }
    QTableWidget {
        background-color: #0c1829;
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 6px;
        gridline-color: rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
    }
    QTableWidget::item {
        padding: 6px;
    }
    QTableWidget::item:selected {
        background-color: #1e3a5f;
        color: #38bdf8;
    }
    QHeaderView::section {
        background-color: #14253d;
        color: #38bdf8;
        font-weight: 700;
        padding: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }
    QCheckBox {
        spacing: 8px;
        color: #e2e8f0;
    }
    QCheckBox::indicator {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 1px solid #475569;
        background: #0f1d30;
    }
    QCheckBox::indicator:checked {
        background-color: #2563eb;
        border-color: #38bdf8;
    }
    QSlider::groove:horizontal {
        height: 6px;
        background: #1e293b;
        border-radius: 3px;
    }
    QSlider::sub-page:horizontal {
        background: #38bdf8;
        border-radius: 3px;
    }
    QSlider::handle:horizontal {
        background: #ffffff;
        border: 2px solid #38bdf8;
        width: 16px;
        margin-top: -5px;
        margin-bottom: -5px;
        border-radius: 8px;
    }
    QTextBrowser {
        background-color: #0c1829;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 12px;
        color: #e2e8f0;
    }
    QProgressBar {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        text-align: center;
        background: #0f1d30;
        color: #ffffff;
        font-weight: 600;
    }
    QProgressBar::chunk {
        background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284c7, stop:1 #38bdf8);
        border-radius: 5px;
    }
    """

    class KPICard(QFrame):
        def __init__(self, title: str, value: str, accent_color: str = "#38BDF8"):
            super().__init__()
            self.setObjectName("card")
            self.setStyleSheet(f"""
                QFrame#card {{
                    background-color: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    padding: 10px;
                }}
                QFrame#card:hover {{
                    border: 1px solid {accent_color};
                }}
            """)
            layout = QVBoxLayout(self)
            layout.setContentsMargins(12, 10, 12, 10)
            layout.setSpacing(4)

            lbl_title = QLabel(title)
            lbl_title.setStyleSheet("font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase;")
            layout.addWidget(lbl_title)

            self.lbl_value = QLabel(value)
            self.lbl_value.setStyleSheet(f"font-size: 22px; font-weight: 800; color: {accent_color};")
            layout.addWidget(self.lbl_value)

        def set_value(self, val: str):
            self.lbl_value.setText(val)


    class ChartViewWidget(QWidget):
        def __init__(self, title: str = ""):
            super().__init__()
            self.title = title
            self.current_html = ""
            self.temp_file = None
            self.layout = QVBoxLayout(self)
            self.layout.setContentsMargins(0, 0, 0, 0)

            self.top_bar = QHBoxLayout()
            self.lbl_chart_title = QLabel(self.title)
            self.lbl_chart_title.setStyleSheet("font-size: 14px; font-weight: 700; color: #F1F5F9;")
            self.top_bar.addWidget(self.lbl_chart_title)
            self.top_bar.addStretch()

            self.btn_open_browser = QPushButton("🌐 Ouvrir plein écran")
            self.btn_open_browser.setStyleSheet("padding: 4px 8px; font-size: 11px;")
            self.btn_open_browser.clicked.connect(self.open_in_browser)
            self.btn_open_browser.setVisible(False)
            self.top_bar.addWidget(self.btn_open_browser)
            self.layout.addLayout(self.top_bar)

            if HAS_WEBENGINE:
                self.web_view = QWebEngineView()
                self.web_view.setStyleSheet("background: #0c1829; border: 1px solid #1e293b; border-radius: 8px;")
                if self.web_view.page() is not None:
                    self.web_view.page().setBackgroundColor(QColor("#0c1829"))
                self.layout.addWidget(self.web_view)
            else:
                self.web_view = None
                self.fallback_browser = QTextBrowser()
                self.fallback_browser.setStyleSheet("background: #0c1829; border: 1px solid #1e293b; border-radius: 8px;")
                self.fallback_browser.setHtml(
                    "<div style='text-align:center; padding:40px; color:#94A3B8; font-family:Segoe UI, sans-serif;'>"
                    "<h3>Graphique interactif prêt</h3>"
                    "<p>Cliquez sur le bouton ci-dessus pour afficher le graphique dans votre navigateur par défaut.</p>"
                    "</div>"
                )
                self.layout.addWidget(self.fallback_browser)

        def set_figure(self, fig):
            if not HAS_PLOTLY or fig is None:
                return
            fig.update_layout(
                template="plotly_dark",
                paper_bgcolor="#0c1829",
                plot_bgcolor="#0c1829",
                font=dict(color="#94A3B8", family="Segoe UI, sans-serif"),
                margin=dict(l=30, r=20, t=40, b=30),
                autosize=True,
                hoverlabel=dict(bgcolor="#0F172A", font=dict(size=12))
            )
            fig.update_xaxes(showgrid=True, gridwidth=1, gridcolor="rgba(255,255,255,0.06)")
            fig.update_yaxes(showgrid=True, gridwidth=1, gridcolor="rgba(255,255,255,0.06)")

            # Génération HTML avec script Plotly 100% autonome et hors-ligne (zéro CDN, zéro blocage pare-feu)
            raw_html = pio.to_html(fig, include_plotlyjs=True, full_html=False)
            html_str = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{
        background-color: #0c1829 !important;
        color: #F1F5F9;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: Segoe UI, sans-serif;
    }}
    .plotly-graph-div {{
        height: 100vh !important;
        width: 100vw !important;
    }}
</style>
</head>
<body style="background-color: #0c1829;">
{raw_html}
</body>
</html>"""

            self.current_html = html_str
            self.btn_open_browser.setVisible(True)

            # Écriture dans un fichier temporaire pour chargement fluide sous QWebEngine
            if self.temp_file and os.path.exists(self.temp_file):
                try:
                    os.remove(self.temp_file)
                except Exception:
                    pass

            fd, path = tempfile.mkstemp(suffix=".html", prefix="algoplanr_chart_")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(html_str)
            self.temp_file = path

            if self.web_view is not None:
                if self.web_view.page() is not None:
                    self.web_view.page().setBackgroundColor(QColor("#0c1829"))
                self.web_view.load(QUrl.fromLocalFile(os.path.abspath(path)))
            else:
                self.fallback_browser.setHtml(
                    "<div style='text-align:center; padding:30px; color:#38BDF8; font-family:Segoe UI, sans-serif;'>"
                    "<h4>📊 Visualisation Interactive Générée</h4>"
                    "<p style='color:#E2E8F0;'>Cliquez sur <b>🌐 Ouvrir plein écran</b> pour afficher et interagir avec la cartographie ou le graphique complet.</p>"
                    "</div>"
                )

        def open_in_browser(self):
            if self.temp_file and os.path.exists(self.temp_file):
                webbrowser.open(f"file://{os.path.abspath(self.temp_file)}")
            elif self.current_html:
                fd, path = tempfile.mkstemp(suffix=".html", prefix="algoplanr_chart_")
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(self.current_html)
                webbrowser.open(f"file://{os.path.abspath(path)}")


    # ============================================================
    # FENÊTRE PRINCIPALE PYSIDE6
    # ============================================================

    class MainWindow(QMainWindow):
        def __init__(self):
            super().__init__()
            self.setWindowTitle("AlgoPlanR • Système Intégré d'Affectation des Enseignants — MINEDUB / PAREC")
            self.resize(1340, 880)
            self.setStyleSheet(DARK_STYLESHEET)

            # Definition de l icone de la fenetre principale
            icon_path = trouver_chemin_logo("app_icon.ico")
            if not (icon_path and os.path.exists(icon_path)):
                icon_path = trouver_chemin_logo("algoR.png")
            if icon_path and os.path.exists(icon_path):
                self.setWindowIcon(QIcon(icon_path))

            self.cfg = json.loads(json.dumps(DEFAULT_CONFIG))
            self.prince_assignments: List[dict] = []
            self.prince_authenticated: bool = False
            self.df_etab: Optional[pd.DataFrame] = None
            self.df_ens: Optional[pd.DataFrame] = None
            self.path_etab: str = ""
            self.path_ens: str = ""
            self.f_etab_valide: bool = False
            self.f_ens_valide: bool = False
            self.resultat: Optional[dict] = None
            self.client_ia = None

            self.setup_ui()

        def setup_ui(self):
            main_splitter = QSplitter(Qt.Horizontal)
            self.setCentralWidget(main_splitter)

            # ------------------ VOLET GAUCHE (SIDEBAR) ------------------
            sidebar_frame = QFrame()
            sidebar_frame.setObjectName("sidebar")
            sidebar_frame.setProperty("class", "sidebar")
            sidebar_layout = QVBoxLayout(sidebar_frame)
            sidebar_layout.setContentsMargins(14, 14, 14, 14)
            sidebar_layout.setSpacing(10)

            lbl_side_title = QLabel("⚙️ Paramétrage (Réf. MINEDUB)")
            lbl_side_title.setStyleSheet("font-size: 15px; font-weight: 800; color: #38bdf8;")
            sidebar_layout.addWidget(lbl_side_title)

            side_scroll = QScrollArea()
            side_scroll.setWidgetResizable(True)
            side_container = QWidget()
            side_container_layout = QVBoxLayout(side_container)
            side_container_layout.setContentsMargins(0, 0, 0, 0)
            side_container_layout.setSpacing(12)

            grp_phases = QGroupBox("📍 Phases de Déploiement")
            lay_phases = QVBoxLayout(grp_phases)
            self.chk_p1 = QCheckBox("Phase 1 : Satisfaction des vœux")
            self.chk_p1.setChecked(True)
            self.chk_p2a = QCheckBox("Phase 2 : Proximité IAEB")
            self.chk_p2a.setChecked(True)
            self.chk_p2b = QCheckBox("Phase 2 : Proximité département")
            self.chk_p2b.setChecked(True)
            self.chk_p3 = QCheckBox("Phase 3 : Extension régionale")
            self.chk_p3.setChecked(True)
            for c in (self.chk_p1, self.chk_p2a, self.chk_p2b, self.chk_p3):
                lay_phases.addWidget(c)
            side_container_layout.addWidget(grp_phases)

            grp_e1 = QGroupBox("⚖️ Étage 1 : Barème Individuel")
            lay_e1 = QGridLayout(grp_e1)
            self.spin_c1 = self._add_slider_row(lay_e1, 0, "C1 : Carrière", 0.30)
            self.spin_c2 = self._add_slider_row(lay_e1, 1, "C2 : Poste", 0.25)
            self.spin_c3 = self._add_slider_row(lay_e1, 2, "C3 : Famille", 0.20)
            self.spin_c4 = self._add_slider_row(lay_e1, 3, "C4 : Formation", 0.15)
            self.spin_c5 = self._add_slider_row(lay_e1, 4, "C5 : Cohorte Âge", 0.10)
            side_container_layout.addWidget(grp_e1)

            grp_e2 = QGroupBox("🎯 Étage 2 : Score d'Appariement")
            lay_e2 = QGridLayout(grp_e2)
            lbl_info_e2 = QLabel("Score = Z1(Barème) + Z2(Up) + Z3(Proximité) + Z4(Ajustements)")
            lbl_info_e2.setWordWrap(True)
            lbl_info_e2.setStyleSheet("color: #94A3B8; font-size: 11px; margin-bottom: 6px;")
            lay_e2.addWidget(lbl_info_e2, 0, 0, 1, 2)
            self.spin_z1 = self._add_slider_row(lay_e2, 1, "Z1 : Barème", 0.25)
            self.spin_z2 = self._add_slider_row(lay_e2, 2, "Z2 : Up", 0.25)
            self.spin_z3 = self._add_slider_row(lay_e2, 3, "Z3 : Proximité", 0.25)
            self.spin_z4 = self._add_slider_row(lay_e2, 4, "Z4 : Ajustements", 0.25)
            side_container_layout.addWidget(grp_e2)

            grp_ia = QGroupBox("🤖 Configuration IA")
            lay_ia = QVBoxLayout(grp_ia)
            lay_ia.addWidget(QLabel("Clé API Gemini :"))
            self.txt_gemini_key = QLineEdit()
            self.txt_gemini_key.setEchoMode(QLineEdit.Password)
            self.txt_gemini_key.setText(os.getenv("GEMINI_API_KEY", ""))
            lay_ia.addWidget(self.txt_gemini_key)
            side_container_layout.addWidget(grp_ia)

            side_container_layout.addStretch()
            side_scroll.setWidget(side_container)
            sidebar_layout.addWidget(side_scroll)
            sidebar_frame.setMinimumWidth(320)
            sidebar_frame.setMaximumWidth(400)
            main_splitter.addWidget(sidebar_frame)

            # ------------------ ZONE CENTRALE CONTENU ------------------
            center_scroll = QScrollArea()
            center_scroll.setWidgetResizable(True)
            center_container = QWidget()
            self.center_layout = QVBoxLayout(center_container)
            self.center_layout.setContentsMargins(20, 18, 20, 20)
            self.center_layout.setSpacing(18)

            header_card = QFrame()
            header_card.setProperty("class", "headerBox")
            header_card.setObjectName("card")
            header_card_layout = QHBoxLayout(header_card)
            header_card_layout.setContentsMargins(16, 12, 16, 12)

            lbl_logo_left = QLabel()
            path_logo1 = trouver_chemin_logo("algoR.png", r"C:\Users\GLC\Documents\Parec\MINEDUB\algobaba\SIGERH\algoR.png")
            if path_logo1 and os.path.exists(path_logo1):
                pix = QPixmap(path_logo1).scaled(70, 70, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                lbl_logo_left.setPixmap(pix)
            else:
                lbl_logo_left.setText("🏛️")
                lbl_logo_left.setStyleSheet("font-size: 38px;")
            header_card_layout.addWidget(lbl_logo_left)

            text_vbox = QVBoxLayout()
            lbl_h1 = QLabel("AlgoPlanR • Système Intégré d'Affectation des Enseignants")
            lbl_h1.setStyleSheet("font-size: 22px; font-weight: 800; color: #38bdf8;")
            lbl_motto = QLabel("« Optimiser les ressources éducatives, c'est concilier équité algorithmique, prérogatives institutionnelles et besoins réels du terrain. »")
            lbl_motto.setStyleSheet("font-size: 12px; font-style: italic; color: #94A3B8;")
            lbl_motto.setWordWrap(True)
            text_vbox.addWidget(lbl_h1)
            text_vbox.addWidget(lbl_motto)
            header_card_layout.addLayout(text_vbox, stretch=1)

            lbl_logo_right = QLabel()
            path_logo2 = trouver_chemin_logo("logoparec.png", r"C:\Users\GLC\Documents\Parec\MINEDUB\algobaba\SIGERH\logoparec.png")
            if path_logo2 and os.path.exists(path_logo2):
                pix2 = QPixmap(path_logo2).scaled(70, 70, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                lbl_logo_right.setPixmap(pix2)
            else:
                lbl_logo_right.setText("📊")
                lbl_logo_right.setStyleSheet("font-size: 38px;")
            header_card_layout.addWidget(lbl_logo_right)

            self.center_layout.addWidget(header_card)

            sec1_title = QLabel("1. 📂 Sources de données")
            sec1_title.setStyleSheet("font-size: 16px; font-weight: 800; color: #F1F5F9;")
            self.center_layout.addWidget(sec1_title)

            upload_grid = QHBoxLayout()
            upload_grid.setSpacing(14)

            box_etab = QFrame()
            box_etab.setObjectName("card")
            box_etab.setStyleSheet("QFrame#card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; }")
            lay_be = QVBoxLayout(box_etab)
            lay_be.addWidget(QLabel("<b>📘 Fichier Établissement (l'Offre)</b>"))
            self.btn_load_etab = QPushButton("📁 Charger le fichier Excel (.xlsx, .xls)")
            self.btn_load_etab.clicked.connect(self.select_file_etab)
            lay_be.addWidget(self.btn_load_etab)
            self.lbl_etab_status = QLabel("En attente de fichier...")
            self.lbl_etab_status.setStyleSheet("color: #94A3B8; font-size: 11px;")
            lay_be.addWidget(self.lbl_etab_status)
            btn_cols_etab = QPushButton("📋 Colonnes obligatoires")
            btn_cols_etab.clicked.connect(lambda: QMessageBox.information(
                self, "Colonnes Établissement", ", ".join(COLONNES_ATTENDUES_ETAB)))
            btn_cols_etab.setStyleSheet("font-size: 11px; padding: 3px 6px; background: transparent; border: 1px solid #334155;")
            lay_be.addWidget(btn_cols_etab)
            upload_grid.addWidget(box_etab)

            box_ens = QFrame()
            box_ens.setObjectName("card")
            box_ens.setStyleSheet("QFrame#card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; }")
            lay_ben = QVBoxLayout(box_ens)
            lay_ben.addWidget(QLabel("<b>👩🏫 Fichier Enseignant (la Demande)</b>"))
            self.btn_load_ens = QPushButton("📁 Charger le fichier Excel (.xlsx, .xls)")
            self.btn_load_ens.clicked.connect(self.select_file_ens)
            lay_ben.addWidget(self.btn_load_ens)
            self.lbl_ens_status = QLabel("En attente de fichier...")
            self.lbl_ens_status.setStyleSheet("color: #94A3B8; font-size: 11px;")
            lay_ben.addWidget(self.lbl_ens_status)
            btn_cols_ens = QPushButton("📋 Colonnes obligatoires")
            btn_cols_ens.clicked.connect(lambda: QMessageBox.information(
                self, "Colonnes Enseignant", ", ".join(COLONNES_ATTENDUES_ENS)))
            btn_cols_ens.setStyleSheet("font-size: 11px; padding: 3px 6px; background: transparent; border: 1px solid #334155;")
            lay_ben.addWidget(btn_cols_ens)
            upload_grid.addWidget(box_ens)

            self.center_layout.addLayout(upload_grid)

            # Module Effet de Prince
            self.prince_box = QFrame()
            self.prince_box.setProperty("class", "princeBox")
            self.prince_box.setObjectName("card")
            self.prince_layout = QVBoxLayout(self.prince_box)
            self.prince_layout.setContentsMargins(16, 14, 16, 14)

            prince_head = QHBoxLayout()
            prince_title_lbl = QLabel("👑 <b>Module Dérogatoire (« Effet de Prince »)</b>")
            prince_title_lbl.setStyleSheet("font-size: 15px; color: #FDE047;")
            prince_head.addWidget(prince_title_lbl)
            prince_head.addStretch()

            self.lbl_prince_badge = QLabel("🔒 Verrouillé")
            self.lbl_prince_badge.setStyleSheet("background: rgba(239,68,68,0.2); color:#F87171; padding:4px 10px; border-radius:8px; font-weight:700; font-size:11px;")
            prince_head.addWidget(self.lbl_prince_badge)
            self.prince_layout.addLayout(prince_head)

            lbl_prince_sub = QLabel("Espace réservé à l'autorité pour ordonner des affectations directes discrétionnaires (Phase 0).")
            lbl_prince_sub.setStyleSheet("color: #E2E8F0; font-size: 12px; margin-bottom: 8px;")
            self.prince_layout.addWidget(lbl_prince_sub)

            self.prince_auth_frame = QFrame()
            lay_pauth = QHBoxLayout(self.prince_auth_frame)
            lay_pauth.setContentsMargins(0, 0, 0, 0)
            lay_pauth.addWidget(QLabel("Mot de passe :"))
            self.txt_prince_pwd = QLineEdit()
            self.txt_prince_pwd.setEchoMode(QLineEdit.Password)
            self.txt_prince_pwd.setPlaceholderText("Entrez le mot de passe autorité...")
            lay_pauth.addWidget(self.txt_prince_pwd)
            self.btn_prince_unlock = QPushButton("🔓 Déverrouiller")
            self.btn_prince_unlock.clicked.connect(self.unlock_prince)
            lay_pauth.addWidget(self.btn_prince_unlock)
            self.prince_layout.addWidget(self.prince_auth_frame)

            self.prince_mgmt_frame = QFrame()
            lay_pmgmt = QVBoxLayout(self.prince_mgmt_frame)
            lay_pmgmt.setContentsMargins(0, 0, 0, 0)

            prince_toolbar = QHBoxLayout()
            lbl_ok = QLabel("✅ Accès autorisé aux dérogations hiérarchiques")
            lbl_ok.setStyleSheet("color: #34D399; font-weight: 700;")
            prince_toolbar.addWidget(lbl_ok)
            prince_toolbar.addStretch()
            self.btn_prince_lock = QPushButton("🔒 Verrouiller")
            self.btn_prince_lock.clicked.connect(self.lock_prince)
            prince_toolbar.addWidget(self.btn_prince_lock)
            lay_pmgmt.addLayout(prince_toolbar)

            prince_tabs = QTabWidget()
            tab_pman = QWidget()
            lay_tman = QHBoxLayout(tab_pman)
            self.txt_p_ens = QLineEdit()
            self.txt_p_ens.setPlaceholderText("Matricule Enseignant")
            self.txt_p_etab = QLineEdit()
            self.txt_p_etab.setPlaceholderText("Identifiant Établissement")
            self.txt_p_motif = QLineEdit("Ordre hiérarchique")
            self.txt_p_motif.setPlaceholderText("Motif officiel")
            btn_add_p = QPushButton("➕ Ajouter")
            btn_add_p.clicked.connect(self.add_prince_entry)
            lay_tman.addWidget(self.txt_p_ens)
            lay_tman.addWidget(self.txt_p_etab)
            lay_tman.addWidget(self.txt_p_motif)
            lay_tman.addWidget(btn_add_p)
            prince_tabs.addTab(tab_pman, "📝 Saisie Manuelle")

            tab_pfile = QWidget()
            lay_tpfile = QHBoxLayout(tab_pfile)
            btn_import_p = QPushButton("📄 Importer fichier dérogations (.xlsx, .csv)")
            btn_import_p.clicked.connect(self.import_prince_file)
            lay_tpfile.addWidget(btn_import_p)
            prince_tabs.addTab(tab_pfile, "📄 Import Fichier")
            lay_pmgmt.addWidget(prince_tabs)

            self.tbl_prince = QTableWidget(0, 3)
            self.tbl_prince.setHorizontalHeaderLabels(["Matricule Enseignant", "Établissement Cible", "Motif"])
            self.tbl_prince.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
            self.tbl_prince.setMaximumHeight(140)
            lay_pmgmt.addWidget(self.tbl_prince)

            btn_clear_p = QPushButton("🗑️ Vider les dérogations")
            btn_clear_p.clicked.connect(self.clear_prince_entries)
            lay_pmgmt.addWidget(btn_clear_p)

            self.prince_mgmt_frame.setVisible(False)
            self.prince_layout.addWidget(self.prince_mgmt_frame)
            self.center_layout.addWidget(self.prince_box)

            # Bouton Lancement
            self.btn_run = QPushButton("🚀 Calculer les Affectations")
            self.btn_run.setProperty("class", "primary")
            self.btn_run.setFixedHeight(46)
            self.btn_run.setEnabled(False)
            self.btn_run.clicked.connect(self.start_calculation)
            self.center_layout.addWidget(self.btn_run)

            self.progress_bar = QProgressBar()
            self.progress_bar.setRange(0, 0)
            self.progress_bar.setVisible(False)
            self.center_layout.addWidget(self.progress_bar)

            # Dashboard
            self.dashboard_widget = QWidget()
            self.dash_layout = QVBoxLayout(self.dashboard_widget)
            self.dash_layout.setContentsMargins(0, 10, 0, 0)
            self.dash_layout.setSpacing(18)

            lbl_dash_title = QLabel("2. 📈 Vue d'Ensemble & Décision")
            lbl_dash_title.setStyleSheet("font-size: 18px; font-weight: 800; color: #F1F5F9;")
            self.dash_layout.addWidget(lbl_dash_title)

            # Barre de filtrage hiérarchique : National / Départemental / Communal
            self.geo_filter_frame = QFrame()
            self.geo_filter_frame.setObjectName("card")
            self.geo_filter_frame.setStyleSheet("""
                QFrame#card {
                    background-color: rgba(15, 23, 42, 0.7);
                    border: 1px solid rgba(56, 189, 248, 0.35);
                    border-radius: 12px;
                    padding: 8px 12px;
                }
            """)
            geo_layout = QVBoxLayout(self.geo_filter_frame)
            geo_layout.setContentsMargins(12, 10, 12, 10)
            geo_layout.setSpacing(10)

            # Ligne 1 : Boutons d'accès rapide aux niveaux
            geo_header_row = QHBoxLayout()
            lbl_geo_icon = QLabel("🌍 <b>Échelle d'Analyse Territoriale :</b>")
            lbl_geo_icon.setStyleSheet("font-size: 13px; color: #38BDF8;")
            geo_header_row.addWidget(lbl_geo_icon)

            self.btn_scope_national = QPushButton("🇨🇲 Vue Nationale")
            self.btn_scope_dept = QPushButton("🏢 Vue Départementale")
            self.btn_scope_commune = QPushButton("🏘️ Vue Communale")

            for b in (self.btn_scope_national, self.btn_scope_dept, self.btn_scope_commune):
                b.setCheckable(True)
                b.setStyleSheet("""
                    QPushButton {
                        padding: 6px 14px; font-size: 12px; font-weight: 600;
                        border-radius: 6px; border: 1px solid rgba(255,255,255,0.18);
                        background: rgba(255,255,255,0.06); color: #E2E8F0;
                    }
                    QPushButton:checked {
                        background: #38BDF8; color: #0F172A; font-weight: 700;
                        border: 1px solid #38BDF8;
                    }
                    QPushButton:hover:!checked {
                        background: rgba(255,255,255,0.12);
                    }
                """)
                geo_header_row.addWidget(b)

            self.btn_scope_national.setChecked(True)
            self.btn_scope_national.clicked.connect(self.select_scope_national)
            self.btn_scope_dept.clicked.connect(self.select_scope_dept)
            self.btn_scope_commune.clicked.connect(self.select_scope_commune)

            geo_header_row.addStretch()

            self.lbl_active_scope_badge = QLabel("📌 Périmètre : National (Ensemble du pays)")
            self.lbl_active_scope_badge.setStyleSheet("font-size: 11px; font-weight: 700; color: #34D399; background: rgba(52, 211, 153, 0.12); padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(52, 211, 153, 0.35);")
            geo_header_row.addWidget(self.lbl_active_scope_badge)

            geo_layout.addLayout(geo_header_row)

            # Ligne 2 : Sélecteurs en cascade (Région, Département, Commune)
            geo_controls_row = QHBoxLayout()
            geo_controls_row.setSpacing(10)

            lbl_reg = QLabel("Région :")
            lbl_reg.setStyleSheet("font-size: 12px; color: #94A3B8; font-weight: 600;")
            self.cmb_region = QComboBox()
            self.cmb_region.addItem("Toutes les Régions (National)")
            self.cmb_region.setStyleSheet("min-width: 170px; padding: 4px 8px; font-size: 12px;")
            self.cmb_region.currentIndexChanged.connect(self.on_region_changed)

            lbl_d = QLabel("Département :")
            lbl_d.setStyleSheet("font-size: 12px; color: #94A3B8; font-weight: 600;")
            self.cmb_dept = QComboBox()
            self.cmb_dept.addItem("Tous les Départements")
            self.cmb_dept.setStyleSheet("min-width: 170px; padding: 4px 8px; font-size: 12px;")
            self.cmb_dept.currentIndexChanged.connect(self.on_dept_changed)

            lbl_c = QLabel("Commune :")
            lbl_c.setStyleSheet("font-size: 12px; color: #94A3B8; font-weight: 600;")
            self.cmb_commune = QComboBox()
            self.cmb_commune.addItem("Toutes les Communes")
            self.cmb_commune.setStyleSheet("min-width: 170px; padding: 4px 8px; font-size: 12px;")
            self.cmb_commune.currentIndexChanged.connect(self.on_commune_changed)

            btn_reset_geo = QPushButton("🔄 Réinitialiser (National)")
            btn_reset_geo.setStyleSheet("padding: 5px 12px; font-size: 11px;")
            btn_reset_geo.clicked.connect(self.select_scope_national)

            geo_controls_row.addWidget(lbl_reg)
            geo_controls_row.addWidget(self.cmb_region)
            geo_controls_row.addWidget(lbl_d)
            geo_controls_row.addWidget(self.cmb_dept)
            geo_controls_row.addWidget(lbl_c)
            geo_controls_row.addWidget(self.cmb_commune)
            geo_controls_row.addWidget(btn_reset_geo)
            geo_controls_row.addStretch()

            geo_layout.addLayout(geo_controls_row)
            self.dash_layout.addWidget(self.geo_filter_frame)

            kpi_row = QHBoxLayout()
            kpi_row.setSpacing(10)
            self.kpi_besoin = KPICard("📌 BESOIN", "0", "#38BDF8")
            self.kpi_vivier = KPICard("👥 VIVIER", "0", "#818CF8")
            self.kpi_affectes = KPICard("✅ AFFECTÉS", "0", "#34D399")
            self.kpi_prince = KPICard("👑 PRINCE", "0", "#EAB308")
            self.kpi_non_aff = KPICard("⏳ NON AFF.", "0", "#FBBF24")
            self.kpi_vacants = KPICard("🏢 VACANTS", "0", "#C084FC")
            self.kpi_recruter = KPICard("🚨 À RECRUTER", "0", "#F87171")
            for k in (self.kpi_besoin, self.kpi_vivier, self.kpi_affectes, self.kpi_prince,
                      self.kpi_non_aff, self.kpi_vacants, self.kpi_recruter):
                kpi_row.addWidget(k)
            self.dash_layout.addLayout(kpi_row)

            self.main_tabs = QTabWidget()
            self.main_tabs.setMinimumHeight(550)

            self.tab_synthese = QWidget()
            self.setup_tab_synthese()
            self.main_tabs.addTab(self.tab_synthese, "📊 Synthèse")

            self.tab_carto = QWidget()
            self.setup_tab_carto()
            self.main_tabs.addTab(self.tab_carto, "🗺️ Cartographie")

            self.tab_vivier = QWidget()
            self.setup_tab_vivier()
            self.main_tabs.addTab(self.tab_vivier, "🧑🏫 Vivier")

            self.tab_ecoles = QWidget()
            self.setup_tab_ecoles()
            self.main_tabs.addTab(self.tab_ecoles, "🏫 Écoles")

            self.tab_export = QWidget()
            self.setup_tab_export()
            self.main_tabs.addTab(self.tab_export, "📋 Données & Export")

            self.tab_proj = QWidget()
            self.setup_tab_projections()
            self.main_tabs.addTab(self.tab_proj, "🔮 Projections N→N+3")

            self.tab_audit = QWidget()
            self.setup_tab_audit()
            self.main_tabs.addTab(self.tab_audit, "📜 Journal d'Audit")

            self.tab_ia = QWidget()
            self.setup_tab_ia()
            self.main_tabs.addTab(self.tab_ia, "🤖 IA Décisionnelle")

            self.dash_layout.addWidget(self.main_tabs)
            self.dashboard_widget.setVisible(False)
            self.center_layout.addWidget(self.dashboard_widget)

            self.placeholder_frame = QFrame()
            self.placeholder_frame.setObjectName("card")
            self.placeholder_frame.setStyleSheet("QFrame#card { background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); border-radius: 14px; padding: 40px; }")
            lay_ph = QVBoxLayout(self.placeholder_frame)
            lay_ph.setAlignment(Qt.AlignCenter)
            lbl_ph_icon = QLabel("📂")
            lbl_ph_icon.setStyleSheet("font-size: 48px;")
            lbl_ph_icon.setAlignment(Qt.AlignCenter)
            lbl_ph_t1 = QLabel("<b>En attente des données</b>")
            lbl_ph_t1.setStyleSheet("font-size: 18px; color: #FFFFFF;")
            lbl_ph_t1.setAlignment(Qt.AlignCenter)
            lbl_ph_t2 = QLabel("Téléversez les deux fichiers Excel et cliquez sur <b>« Calculer les Affectations »</b>.")
            lbl_ph_t2.setStyleSheet("color: #94A3B8; font-size: 13px;")
            lbl_ph_t2.setAlignment(Qt.AlignCenter)
            lay_ph.addWidget(lbl_ph_icon)
            lay_ph.addWidget(lbl_ph_t1)
            lay_ph.addWidget(lbl_ph_t2)
            self.center_layout.addWidget(self.placeholder_frame)

            self.center_layout.addStretch()
            center_scroll.setWidget(center_container)
            main_splitter.addWidget(center_scroll)
            main_splitter.setStretchFactor(0, 0)
            main_splitter.setStretchFactor(1, 1)

        def _add_slider_row(self, grid: QGridLayout, row: int, label: str, val: float) -> QDoubleSpinBox:
            lbl = QLabel(label)
            lbl.setStyleSheet("font-size: 12px; color: #E2E8F0;")
            spin = QDoubleSpinBox()
            spin.setRange(0.0, 1.0)
            spin.setSingleStep(0.05)
            spin.setValue(val)
            spin.setDecimals(2)
            spin.setFixedWidth(70)
            grid.addWidget(lbl, row, 0)
            grid.addWidget(spin, row, 1)
            return spin

        def select_file_etab(self):
            fpath, _ = QFileDialog.getOpenFileName(self, "Choisir le fichier Établissements", "", "Fichiers Excel (*.xlsx *.xls)")
            if fpath:
                try:
                    headers = pd.read_excel(fpath, nrows=0)
                    manquantes = verifier_colonnes(headers.columns, COLONNES_ATTENDUES_ETAB)
                    if manquantes:
                        self.lbl_etab_status.setText(f"⚠️ Manquantes : {', '.join(manquantes)}")
                        self.lbl_etab_status.setStyleSheet("color: #F87171; font-size: 11px;")
                        self.f_etab_valide = False
                    else:
                        self.df_etab = pd.read_excel(fpath, dtype=str)
                        self.path_etab = fpath
                        self.lbl_etab_status.setText(f"✅ {os.path.basename(fpath)} conforme ({len(self.df_etab)} écoles)")
                        self.lbl_etab_status.setStyleSheet("color: #34D399; font-size: 11px;")
                        self.f_etab_valide = True
                except Exception as e:
                    self.lbl_etab_status.setText(f"❌ Erreur : {e}")
                    self.lbl_etab_status.setStyleSheet("color: #F87171; font-size: 11px;")
                    self.f_etab_valide = False
                self.check_ready_to_run()

        def select_file_ens(self):
            fpath, _ = QFileDialog.getOpenFileName(self, "Choisir le fichier Enseignants", "", "Fichiers Excel (*.xlsx *.xls)")
            if fpath:
                try:
                    headers = pd.read_excel(fpath, nrows=0)
                    manquantes = verifier_colonnes(headers.columns, COLONNES_ATTENDUES_ENS)
                    if manquantes:
                        self.lbl_ens_status.setText(f"⚠️ Manquantes : {', '.join(manquantes)}")
                        self.lbl_ens_status.setStyleSheet("color: #F87171; font-size: 11px;")
                        self.f_ens_valide = False
                    else:
                        self.df_ens = pd.read_excel(fpath, dtype=str)
                        self.path_ens = fpath
                        self.lbl_ens_status.setText(f"✅ {os.path.basename(fpath)} conforme ({len(self.df_ens)} enseignants)")
                        self.lbl_ens_status.setStyleSheet("color: #34D399; font-size: 11px;")
                        self.f_ens_valide = True
                except Exception as e:
                    self.lbl_ens_status.setText(f"❌ Erreur : {e}")
                    self.lbl_ens_status.setStyleSheet("color: #F87171; font-size: 11px;")
                    self.f_ens_valide = False
                self.check_ready_to_run()

        def check_ready_to_run(self):
            self.btn_run.setEnabled(self.f_etab_valide and self.f_ens_valide)

        def unlock_prince(self):
            if self.txt_prince_pwd.text().strip() == MOT_DE_PASSE_EFFET_DE_PRINCE:
                self.prince_authenticated = True
                self.lbl_prince_badge.setText("🔓 Déverrouillé")
                self.lbl_prince_badge.setStyleSheet("background: rgba(52,211,153,0.2); color:#34D399; padding:4px 10px; border-radius:8px; font-weight:700; font-size:11px;")
                self.prince_auth_frame.setVisible(False)
                self.prince_mgmt_frame.setVisible(True)
                QMessageBox.information(self, "Effet de Prince", "Accès dérogatoire déverrouillé.")
            else:
                QMessageBox.warning(self, "Erreur", "Mot de passe incorrect.")

        def lock_prince(self):
            self.prince_authenticated = False
            self.lbl_prince_badge.setText("🔒 Verrouillé")
            self.lbl_prince_badge.setStyleSheet("background: rgba(239,68,68,0.2); color:#F87171; padding:4px 10px; border-radius:8px; font-weight:700; font-size:11px;")
            self.txt_prince_pwd.clear()
            self.prince_auth_frame.setVisible(True)
            self.prince_mgmt_frame.setVisible(False)

        def add_prince_entry(self):
            id_ens = self.txt_p_ens.text().strip()
            id_etab = self.txt_p_etab.text().strip()
            motif = self.txt_p_motif.text().strip() or "Ordre hiérarchique"
            if not id_ens or not id_etab:
                QMessageBox.warning(self, "Attention", "Matricule enseignant et Identifiant école requis.")
                return
            self.prince_assignments.append({"id_ens": id_ens, "id_etab": id_etab, "motif": motif})
            self.refresh_prince_table()
            self.txt_p_ens.clear()
            self.txt_p_etab.clear()

        def import_prince_file(self):
            fpath, _ = QFileDialog.getOpenFileName(self, "Importer dérogations", "", "Fichiers (*.xlsx *.csv)")
            if fpath:
                try:
                    df = pd.read_csv(fpath, dtype=str) if fpath.endswith(".csv") else pd.read_excel(fpath, dtype=str)
                    if "id_ens" in df.columns and "id_etab" in df.columns:
                        for _, r in df.iterrows():
                            self.prince_assignments.append({
                                "id_ens": str(r["id_ens"]).strip(),
                                "id_etab": str(r["id_etab"]).strip(),
                                "motif": str(r.get("motif", "Décision hiérarchique")).strip()
                            })
                        self.refresh_prince_table()
                        QMessageBox.information(self, "Import", f"{len(df)} dérogations importées avec succès.")
                    else:
                        QMessageBox.warning(self, "Erreur format", "Le fichier doit comporter les colonnes 'id_ens' et 'id_etab'.")
                except Exception as e:
                    QMessageBox.critical(self, "Erreur", str(e))

        def clear_prince_entries(self):
            self.prince_assignments = []
            self.refresh_prince_table()

        def refresh_prince_table(self):
            self.tbl_prince.setRowCount(len(self.prince_assignments))
            for row, item in enumerate(self.prince_assignments):
                self.tbl_prince.setItem(row, 0, QTableWidgetItem(item["id_ens"]))
                self.tbl_prince.setItem(row, 1, QTableWidgetItem(item["id_etab"]))
                self.tbl_prince.setItem(row, 2, QTableWidgetItem(item["motif"]))

        def start_calculation(self):
            cfg = json.loads(json.dumps(DEFAULT_CONFIG))
            cfg["poids_bareme_individuel"]["C1_carriere_zone"] = float(self.spin_c1.value())
            cfg["poids_bareme_individuel"]["C2_anciennete_poste"] = float(self.spin_c2.value())
            cfg["poids_bareme_individuel"]["C3_charges_familiales"] = float(self.spin_c3.value())
            cfg["poids_bareme_individuel"]["C4_formation_continue"] = float(self.spin_c4.value())
            cfg["poids_bareme_individuel"]["C5_cohorte_age"] = float(self.spin_c5.value())
            cfg["poids_score_appariement"]["Z1_bareme_individu"] = float(self.spin_z1.value())
            cfg["poids_score_appariement"]["Z2_poids_poste_Up"] = float(self.spin_z2.value())
            cfg["poids_score_appariement"]["Z3_proximite"] = float(self.spin_z3.value())
            cfg["poids_score_appariement"]["Z4_ajustements"] = float(self.spin_z4.value())

            cfg["regles_dreb"]["phase1_voeux_actif"] = self.chk_p1.isChecked()
            cfg["regles_dreb"]["phase2_proximite_iaeb"] = self.chk_p2a.isChecked()
            cfg["regles_dreb"]["phase2_proximite_departement"] = self.chk_p2b.isChecked()
            cfg["regles_dreb"]["phase3_extension_regionale"] = self.chk_p3.isChecked()

            self.btn_run.setEnabled(False)
            self.btn_run.setText("⏳ Calcul en cours…")
            self.progress_bar.setVisible(True)

            self.worker = CalculationWorker(self.df_etab, self.df_ens, cfg, self.prince_assignments)
            self.worker.finished.connect(self.on_calculation_finished)
            self.worker.error.connect(self.on_calculation_error)
            self.worker.start()

        def on_calculation_finished(self, res: dict):
            self.resultat_global = res
            self.resultat = res
            self.progress_bar.setVisible(False)
            self.btn_run.setEnabled(True)
            self.btn_run.setText("🚀 Recalculer les Affectations")
            self.placeholder_frame.setVisible(False)
            self.dashboard_widget.setVisible(True)

            # Remplissage des menus déroulants géographiques
            self.populate_geo_filters(res)

            # Application de la vue par défaut (National)
            self.select_scope_national()

            QMessageBox.information(
                self, "Succès",
                "Calcul des affectations achevé avec succès !\n\n"
                "Vous pouvez maintenant naviguer entre les vues :\n"
                "🇨🇲 Nationale • 🏢 Départementale • 🏘️ Communale"
            )

        def on_calculation_error(self, err: str):
            self.progress_bar.setVisible(False)
            self.btn_run.setEnabled(True)
            self.btn_run.setText("🚀 Calculer les Affectations")
            QMessageBox.critical(self, "Erreur d'exécution", err)

        # ------------------ GESTION DU FILTRAGE TERRITORIAL ------------------

        def populate_geo_filters(self, res: dict):
            etab_df = res.get("etab_enrichi", pd.DataFrame())
            self.cmb_region.blockSignals(True)
            self.cmb_dept.blockSignals(True)
            self.cmb_commune.blockSignals(True)

            self.cmb_region.clear()
            self.cmb_region.addItem("Toutes les Régions (National)")
            if not etab_df.empty and COL_ETAB_REGION in etab_df.columns:
                regs = sorted([str(r).strip() for r in etab_df[COL_ETAB_REGION].dropna().unique() if str(r).strip()])
                for r in regs:
                    self.cmb_region.addItem(r)

            self.cmb_dept.clear()
            self.cmb_dept.addItem("Tous les Départements")
            if not etab_df.empty and COL_ETAB_DEPT in etab_df.columns:
                depts = sorted([str(d).strip() for d in etab_df[COL_ETAB_DEPT].dropna().unique() if str(d).strip()])
                for d in depts:
                    self.cmb_dept.addItem(d)

            self.cmb_commune.clear()
            self.cmb_commune.addItem("Toutes les Communes")
            if not etab_df.empty and COL_ETAB_COMMUNE in etab_df.columns:
                comms = sorted([str(c).strip() for c in etab_df[COL_ETAB_COMMUNE].dropna().unique() if str(c).strip()])
                for c in comms:
                    self.cmb_commune.addItem(c)

            self.cmb_region.blockSignals(False)
            self.cmb_dept.blockSignals(False)
            self.cmb_commune.blockSignals(False)

        def select_scope_national(self):
            self.btn_scope_national.setChecked(True)
            self.btn_scope_dept.setChecked(False)
            self.btn_scope_commune.setChecked(False)
            self.cmb_region.blockSignals(True)
            self.cmb_dept.blockSignals(True)
            self.cmb_commune.blockSignals(True)
            self.cmb_region.setCurrentIndex(0)
            self.cmb_dept.setCurrentIndex(0)
            self.cmb_commune.setCurrentIndex(0)
            self.cmb_region.blockSignals(False)
            self.cmb_dept.blockSignals(False)
            self.cmb_commune.blockSignals(False)
            self.apply_geo_filter()

        def select_scope_dept(self):
            self.btn_scope_national.setChecked(False)
            self.btn_scope_dept.setChecked(True)
            self.btn_scope_commune.setChecked(False)
            # Si aucun département sélectionné, sélectionner le premier disponible
            if self.cmb_dept.currentIndex() == 0 and self.cmb_dept.count() > 1:
                self.cmb_dept.setCurrentIndex(1)
            else:
                self.apply_geo_filter()

        def select_scope_commune(self):
            self.btn_scope_national.setChecked(False)
            self.btn_scope_dept.setChecked(False)
            self.btn_scope_commune.setChecked(True)
            # Si aucune commune sélectionnée, sélectionner la première disponible
            if self.cmb_commune.currentIndex() == 0 and self.cmb_commune.count() > 1:
                self.cmb_commune.setCurrentIndex(1)
            else:
                self.apply_geo_filter()

        def on_region_changed(self, idx: int):
            if not hasattr(self, "resultat_global") or not self.resultat_global:
                return
            etab_df = self.resultat_global.get("etab_enrichi", pd.DataFrame())
            sel_reg = self.cmb_region.currentText()

            self.cmb_dept.blockSignals(True)
            self.cmb_commune.blockSignals(True)

            self.cmb_dept.clear()
            self.cmb_dept.addItem("Tous les Départements")
            self.cmb_commune.clear()
            self.cmb_commune.addItem("Toutes les Communes")

            if idx > 0 and not etab_df.empty and COL_ETAB_REGION in etab_df.columns:
                sub_df = etab_df[etab_df[COL_ETAB_REGION].astype(str).str.strip().str.lower() == sel_reg.strip().lower()]
                if COL_ETAB_DEPT in sub_df.columns:
                    depts = sorted([str(d).strip() for d in sub_df[COL_ETAB_DEPT].dropna().unique() if str(d).strip()])
                    for d in depts:
                        self.cmb_dept.addItem(d)
                if COL_ETAB_COMMUNE in sub_df.columns:
                    comms = sorted([str(c).strip() for c in sub_df[COL_ETAB_COMMUNE].dropna().unique() if str(c).strip()])
                    for c in comms:
                        self.cmb_commune.addItem(c)
            elif idx == 0 and not etab_df.empty:
                if COL_ETAB_DEPT in etab_df.columns:
                    depts = sorted([str(d).strip() for d in etab_df[COL_ETAB_DEPT].dropna().unique() if str(d).strip()])
                    for d in depts:
                        self.cmb_dept.addItem(d)
                if COL_ETAB_COMMUNE in etab_df.columns:
                    comms = sorted([str(c).strip() for c in etab_df[COL_ETAB_COMMUNE].dropna().unique() if str(c).strip()])
                    for c in comms:
                        self.cmb_commune.addItem(c)

            self.cmb_dept.blockSignals(False)
            self.cmb_commune.blockSignals(False)
            self.apply_geo_filter()

        def on_dept_changed(self, idx: int):
            if not hasattr(self, "resultat_global") or not self.resultat_global:
                return
            etab_df = self.resultat_global.get("etab_enrichi", pd.DataFrame())
            sel_dept = self.cmb_dept.currentText()
            sel_reg = self.cmb_region.currentText()

            self.cmb_commune.blockSignals(True)
            self.cmb_commune.clear()
            self.cmb_commune.addItem("Toutes les Communes")

            if idx > 0 and not etab_df.empty and COL_ETAB_DEPT in etab_df.columns:
                sub_df = etab_df[etab_df[COL_ETAB_DEPT].astype(str).str.strip().str.lower() == sel_dept.strip().lower()]
                if self.cmb_region.currentIndex() > 0 and COL_ETAB_REGION in sub_df.columns:
                    sub_df = sub_df[sub_df[COL_ETAB_REGION].astype(str).str.strip().str.lower() == sel_reg.strip().lower()]
                if COL_ETAB_COMMUNE in sub_df.columns:
                    comms = sorted([str(c).strip() for c in sub_df[COL_ETAB_COMMUNE].dropna().unique() if str(c).strip()])
                    for c in comms:
                        self.cmb_commune.addItem(c)

                # Si la région n'était pas sélectionnée, auto-sélectionner sa région
                if self.cmb_region.currentIndex() == 0 and COL_ETAB_REGION in sub_df.columns:
                    regs = sub_df[COL_ETAB_REGION].dropna().unique()
                    if len(regs) == 1:
                        reg_name = str(regs[0]).strip()
                        r_idx = self.cmb_region.findText(reg_name)
                        if r_idx != -1:
                            self.cmb_region.blockSignals(True)
                            self.cmb_region.setCurrentIndex(r_idx)
                            self.cmb_region.blockSignals(False)
            elif idx == 0 and not etab_df.empty:
                if self.cmb_region.currentIndex() > 0 and COL_ETAB_REGION in etab_df.columns:
                    sub_df = etab_df[etab_df[COL_ETAB_REGION].astype(str).str.strip().str.lower() == sel_reg.strip().lower()]
                else:
                    sub_df = etab_df
                if COL_ETAB_COMMUNE in sub_df.columns:
                    comms = sorted([str(c).strip() for c in sub_df[COL_ETAB_COMMUNE].dropna().unique() if str(c).strip()])
                    for c in comms:
                        self.cmb_commune.addItem(c)

            self.cmb_commune.blockSignals(False)
            self.apply_geo_filter()

        def on_commune_changed(self, idx: int):
            if not hasattr(self, "resultat_global") or not self.resultat_global:
                return
            etab_df = self.resultat_global.get("etab_enrichi", pd.DataFrame())
            sel_comm = self.cmb_commune.currentText()
            if idx > 0 and not etab_df.empty and COL_ETAB_COMMUNE in etab_df.columns:
                sub_df = etab_df[etab_df[COL_ETAB_COMMUNE].astype(str).str.strip().str.lower() == sel_comm.strip().lower()]
                if self.cmb_dept.currentIndex() == 0 and COL_ETAB_DEPT in sub_df.columns:
                    depts = sub_df[COL_ETAB_DEPT].dropna().unique()
                    if len(depts) == 1:
                        d_name = str(depts[0]).strip()
                        d_idx = self.cmb_dept.findText(d_name)
                        if d_idx != -1:
                            self.cmb_dept.blockSignals(True)
                            self.cmb_dept.setCurrentIndex(d_idx)
                            self.cmb_dept.blockSignals(False)
                if self.cmb_region.currentIndex() == 0 and COL_ETAB_REGION in sub_df.columns:
                    regs = sub_df[COL_ETAB_REGION].dropna().unique()
                    if len(regs) == 1:
                        r_name = str(regs[0]).strip()
                        r_idx = self.cmb_region.findText(r_name)
                        if r_idx != -1:
                            self.cmb_region.blockSignals(True)
                            self.cmb_region.setCurrentIndex(r_idx)
                            self.cmb_region.blockSignals(False)
            self.apply_geo_filter()

        def apply_geo_filter(self):
            if not hasattr(self, "resultat_global") or not self.resultat_global:
                return

            sel_reg = self.cmb_region.currentText() if self.cmb_region.currentIndex() > 0 else ""
            sel_dept = self.cmb_dept.currentText() if self.cmb_dept.currentIndex() > 0 else ""
            sel_comm = self.cmb_commune.currentText() if self.cmb_commune.currentIndex() > 0 else ""

            # Détermination du niveau et du badge
            if sel_comm:
                badge = f"📌 Périmètre : Commune de {sel_comm} ({sel_dept})"
                self.btn_scope_commune.setChecked(True)
                self.btn_scope_dept.setChecked(False)
                self.btn_scope_national.setChecked(False)
                scope_title = f"Commune {sel_comm}"
            elif sel_dept:
                badge = f"📌 Périmètre : Département de {sel_dept} ({sel_reg})"
                self.btn_scope_commune.setChecked(False)
                self.btn_scope_dept.setChecked(True)
                self.btn_scope_national.setChecked(False)
                scope_title = f"Département {sel_dept}"
            elif sel_reg:
                badge = f"📌 Périmètre : Région {sel_reg}"
                self.btn_scope_commune.setChecked(False)
                self.btn_scope_dept.setChecked(False)
                self.btn_scope_national.setChecked(False)
                scope_title = f"Région {sel_reg}"
            else:
                badge = "📌 Périmètre : National (Ensemble du pays)"
                self.btn_scope_commune.setChecked(False)
                self.btn_scope_dept.setChecked(False)
                self.btn_scope_national.setChecked(True)
                scope_title = "National"

            self.lbl_active_scope_badge.setText(badge)

            # Filtrage des données
            filtered_res = self._compute_filtered_data(sel_reg, sel_dept, sel_comm, scope_title)
            self.resultat = filtered_res

            # Mise à jour des cartes KPI (Paramètres)
            s = filtered_res["synthese"]
            self.kpi_besoin.set_value(f"{s['besoin_total']:,}")
            self.kpi_vivier.set_value(f"{s['disponibles']:,}")
            self.kpi_affectes.set_value(f"{s['affectes']:,}")
            self.kpi_prince.set_value(f"{s.get('effet_de_prince', 0):,}")
            self.kpi_non_aff.set_value(f"{s['non_affectes']:,}")
            self.kpi_vacants.set_value(f"{s['postes_non_pourvus']:,}")
            self.kpi_recruter.set_value(f"{s['a_recruter']:,}")

            # Mise à jour de tous les graphiques et onglets
            self.update_tab_synthese()
            self.update_tab_carto()
            self.update_tab_vivier()
            self.update_tab_ecoles()
            self.update_tab_export()

        def _compute_filtered_data(self, sel_reg: str, sel_dept: str, sel_comm: str, scope_title: str) -> dict:
            orig = self.resultat_global
            if not sel_reg and not sel_dept and not sel_comm:
                res = dict(orig)
                res["synthese"] = dict(orig["synthese"])
                res["synthese"]["scope_title"] = "National"
                return res

            etab_df = orig["etab_enrichi"].copy()
            besoin_df = orig["ecoles_en_besoin"].copy()
            postes_non_pourvus = orig["postes_non_pourvus"].copy()
            postes_rouge = orig["postes_rouge_non_pourvus"].copy()
            aff_df = orig["affectations"].copy()
            vivier_df = orig["vivier"].copy()
            non_aff_df = orig["non_affectes"].copy()

            def _filter_geo(df, reg_col, dept_col, comm_col):
                if df.empty:
                    return df
                res = df
                if sel_reg and reg_col in res.columns:
                    res = res[res[reg_col].astype(str).str.strip().str.lower() == sel_reg.strip().lower()]
                if sel_dept and dept_col in res.columns:
                    res = res[res[dept_col].astype(str).str.strip().str.lower() == sel_dept.strip().lower()]
                if sel_comm and comm_col in res.columns:
                    res = res[res[comm_col].astype(str).str.strip().str.lower() == sel_comm.strip().lower()]
                return res

            etab_df = _filter_geo(etab_df, COL_ETAB_REGION, COL_ETAB_DEPT, COL_ETAB_COMMUNE)
            besoin_df = _filter_geo(besoin_df, COL_ETAB_REGION, COL_ETAB_DEPT, COL_ETAB_COMMUNE)
            postes_non_pourvus = _filter_geo(postes_non_pourvus, COL_ETAB_REGION, COL_ETAB_DEPT, COL_ETAB_COMMUNE)
            postes_rouge = _filter_geo(postes_rouge, COL_ETAB_REGION, COL_ETAB_DEPT, COL_ETAB_COMMUNE)

            # Affectations filtrées sur les postes d'accueil
            aff_df = _filter_geo(aff_df, "region_poste", "departement_poste", "commune_poste")

            # Vivier et non-affectés filtrés sur la structure d'attache
            vivier_df = _filter_geo(vivier_df, "region_attache", "departement_attache", "commune_attache")
            non_aff_df = _filter_geo(non_aff_df, "region_attache", "departement_attache", "commune_attache")

            nb_besoin = int(besoin_df["nb_postes_ouverts"].sum()) if not besoin_df.empty and "nb_postes_ouverts" in besoin_df.columns else (len(postes_non_pourvus) + len(aff_df))
            nb_dispo = len(vivier_df)
            nb_aff = len(aff_df)
            nb_prince = int((aff_df["phase"] == "effet_de_prince").sum()) if not aff_df.empty and "phase" in aff_df.columns else 0
            nb_non_aff = len(non_aff_df)
            nb_vacants = len(postes_non_pourvus)
            nb_recruter = nb_vacants

            rt_par_ss = {}
            if not postes_non_pourvus.empty and COL_ETAB_SS in postes_non_pourvus.columns:
                for ss in postes_non_pourvus[COL_ETAB_SS].dropna().unique():
                    rt_par_ss[str(ss)] = int((postes_non_pourvus[COL_ETAB_SS] == ss).sum())

            stats_phase = aff_df["phase"].value_counts().to_dict() if not aff_df.empty and "phase" in aff_df.columns else {}

            synthese_loc = {
                "besoin_total": nb_besoin,
                "disponibles": nb_dispo,
                "affectes": nb_aff,
                "effet_de_prince": nb_prince,
                "non_affectes": nb_non_aff,
                "postes_non_pourvus": nb_vacants,
                "a_recruter": nb_recruter,
                "rt_par_sous_systeme": rt_par_ss,
                "postes_rouge_non_pourvus": len(postes_rouge),
                "stats_phase": stats_phase,
                "scope_title": scope_title,
            }

            return {
                "synthese": synthese_loc,
                "ecoles_en_besoin": besoin_df,
                "affectations": aff_df,
                "non_affectes": non_aff_df,
                "postes_non_pourvus": postes_non_pourvus,
                "postes_rouge_non_pourvus": postes_rouge,
                "vivier": vivier_df,
                "etab_enrichi": etab_df,
                "projections_n3": orig.get("projections_n3", pd.DataFrame()),
                "journal_audit": orig.get("journal_audit", pd.DataFrame()),
                "scope_title": scope_title,
            }

        # ------------------ ONGLETS DE RENDU DYNAMIQUES ------------------

        def setup_tab_synthese(self):
            lay = QVBoxLayout(self.tab_synthese)
            c_charts = QHBoxLayout()
            self.chart_bilan = ChartViewWidget("Bilan Global des Effectifs")
            self.chart_phases = ChartViewWidget("Répartition par Phase")
            c_charts.addWidget(self.chart_bilan)
            c_charts.addWidget(self.chart_phases)
            lay.addLayout(c_charts)

            lay.addWidget(QLabel("<b>📌 Besoin Résiduel Net (R_T) par sous-système</b>"))
            self.tbl_rt = QTableWidget(0, 2)
            self.tbl_rt.setHorizontalHeaderLabels(["Sous-système", "R_T"])
            self.tbl_rt.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
            self.tbl_rt.setMaximumHeight(130)
            lay.addWidget(self.tbl_rt)

            self.lbl_zone_rouge_warning = QLabel("")
            self.lbl_zone_rouge_warning.setStyleSheet("color: #FBBF24; font-weight:700; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); padding: 8px; border-radius: 6px;")
            self.lbl_zone_rouge_warning.setVisible(False)
            lay.addWidget(self.lbl_zone_rouge_warning)

        def update_tab_synthese(self):
            s = self.resultat["synthese"]
            aff_df = self.resultat["affectations"]
            scope = s.get("scope_title", "National")

            if HAS_PLOTLY:
                cats = ["Besoins", "Vivier", "Affectés", "👑 Prince", "Non affectés", "Postes vacants"]
                vals = [s["besoin_total"], s["disponibles"], s["affectes"],
                        s.get("effet_de_prince", 0), s["non_affectes"], s["postes_non_pourvus"]]
                colors = ["#38BDF8", "#818CF8", "#34D399", "#EAB308", "#FBBF24", "#F87171"]
                fig1 = go.Figure(go.Bar(x=cats, y=vals, marker=dict(color=colors), text=vals, textposition="outside"))
                fig1.update_layout(title=f"📊 Bilan des Effectifs — Vue {scope}")
                self.chart_bilan.set_figure(fig1)

                if not aff_df.empty and "phase" in aff_df.columns:
                    pc = aff_df["phase"].value_counts().reset_index()
                    fig2 = px.pie(pc, names="phase", values="count", hole=0.52,
                                  title=f"🎯 Répartition par Phase — Vue {scope}")
                    self.chart_phases.set_figure(fig2)
                else:
                    fig2 = go.Figure()
                    fig2.add_annotation(text=f"Aucune affectation dans ce périmètre ({scope})",
                                        xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
                                        font=dict(size=14, color="#94A3B8"))
                    fig2.update_layout(title=f"🎯 Répartition par Phase — Vue {scope}")
                    self.chart_phases.set_figure(fig2)

            rt = s.get("rt_par_sous_systeme", {})
            self.tbl_rt.setRowCount(len(rt))
            for r_idx, (k, v) in enumerate(rt.items()):
                self.tbl_rt.setItem(r_idx, 0, QTableWidgetItem(str(k)))
                self.tbl_rt.setItem(r_idx, 1, QTableWidgetItem(str(v)))

            nb_zr = s.get("postes_rouge_non_pourvus", 0)
            if nb_zr > 0:
                self.lbl_zone_rouge_warning.setText(f"⚠️ {nb_zr} poste(s) en zone rouge non pourvu(s) dans le périmètre ({scope}).")
                self.lbl_zone_rouge_warning.setVisible(True)
            else:
                self.lbl_zone_rouge_warning.setVisible(False)

        def setup_tab_carto(self):
            lay = QVBoxLayout(self.tab_carto)
            self.chart_carto = ChartViewWidget("Cartographie Géographique des Établissements")
            lay.addWidget(self.chart_carto)

        def update_tab_carto(self):
            etab_enrichi = self.resultat.get("etab_enrichi")
            if etab_enrichi is None or etab_enrichi.empty or not HAS_PLOTLY:
                fig_empty = go.Figure()
                fig_empty.add_annotation(text="Aucun établissement dans ce périmètre territorial",
                                         xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
                                         font=dict(size=14, color="#94A3B8"))
                self.chart_carto.set_figure(fig_empty)
                return

            s = self.resultat.get("synthese", {})
            scope = s.get("scope_title", "National")

            lat_col = next((c for c in etab_enrichi.columns if c.lower() in ["latitude", "lat"]), None)
            lon_col = next((c for c in etab_enrichi.columns if c.lower() in ["longitude", "lon", "lng"]), None)

            # Cas 1 : Coordonnées GPS réelles présentes
            if lat_col and lon_col:
                md = etab_enrichi.copy().dropna(subset=[lat_col, lon_col])
                if not md.empty:
                    zoom_val = 5.5
                    if self.cmb_commune.currentIndex() > 0:
                        zoom_val = 11.0
                    elif self.cmb_dept.currentIndex() > 0:
                        zoom_val = 8.5
                    elif self.cmb_region.currentIndex() > 0:
                        zoom_val = 7.0

                    hover_fields = [c for c in [COL_ETAB_REGION, COL_ETAB_DEPT, COL_ETAB_COMMUNE] if c in md.columns]
                    try:
                        fig = px.scatter_map(md, lat=lat_col, lon=lon_col,
                                             size="nb_postes_ouverts" if "nb_postes_ouverts" in md.columns else None,
                                             color=COL_ETAB_SS if COL_ETAB_SS in md.columns else None,
                                             hover_name=COL_ETAB_ID if COL_ETAB_ID in md.columns else None,
                                             hover_data=hover_fields if hover_fields else None,
                                             zoom=zoom_val, map_style="carto-darkmatter")
                    except Exception:
                        fig = px.scatter_mapbox(md, lat=lat_col, lon=lon_col,
                                                size="nb_postes_ouverts" if "nb_postes_ouverts" in md.columns else None,
                                                color=COL_ETAB_SS if COL_ETAB_SS in md.columns else None,
                                                hover_name=COL_ETAB_ID if COL_ETAB_ID in md.columns else None,
                                                hover_data=hover_fields if hover_fields else None,
                                                zoom=zoom_val, mapbox_style="carto-darkmatter")
                    fig.update_layout(title=f"🗺️ Cartographie GPS des Écoles — Vue {scope}")
                    self.chart_carto.set_figure(fig)
                    return

            # Cas 2 : Format standard MINEDUB sans GPS
            # Si Commune sélectionnée -> Répartition par École
            if self.cmb_commune.currentIndex() > 0:
                top_ec = etab_enrichi.sort_values("nb_postes_ouverts", ascending=False).head(25) if "nb_postes_ouverts" in etab_enrichi.columns else etab_enrichi.head(25)
                fig = px.bar(top_ec, x=COL_ETAB_ID, y="nb_postes_ouverts" if "nb_postes_ouverts" in top_ec.columns else None,
                             color=COL_ETAB_SS if COL_ETAB_SS in top_ec.columns else None,
                             title=f"🏘️ Répartition des Besoins par École — Vue Communale : {scope}",
                             labels={"nb_postes_ouverts": "Besoins (Postes Ouverts)", COL_ETAB_ID: "Établissement"})
                self.chart_carto.set_figure(fig)
            # Si Département sélectionné -> Répartition par Commune
            elif self.cmb_dept.currentIndex() > 0:
                if COL_ETAB_COMMUNE in etab_enrichi.columns and "nb_postes_ouverts" in etab_enrichi.columns:
                    comm_stats = etab_enrichi.groupby(COL_ETAB_COMMUNE)["nb_postes_ouverts"].sum().reset_index()
                    comm_stats = comm_stats.sort_values("nb_postes_ouverts", ascending=False)
                    fig = px.bar(comm_stats, x=COL_ETAB_COMMUNE, y="nb_postes_ouverts",
                                 title=f"🏢 Répartition des Besoins par Commune — Vue Départementale : {scope}",
                                 labels={"nb_postes_ouverts": "Besoins (Postes Ouverts)", COL_ETAB_COMMUNE: "Commune"},
                                 color="nb_postes_ouverts", color_continuous_scale="Tealgrn")
                    self.chart_carto.set_figure(fig)
                else:
                    fig = px.bar(etab_enrichi.head(20), x=COL_ETAB_ID, y="nb_postes_ouverts" if "nb_postes_ouverts" in etab_enrichi.columns else None,
                                 title=f"🏢 Répartition des Besoins — Vue {scope}")
                    self.chart_carto.set_figure(fig)
            # Sinon Vue Nationale ou Régionale -> Répartition par Région & Département
            else:
                grp_cols = [c for c in [COL_ETAB_REGION, COL_ETAB_DEPT] if c in etab_enrichi.columns]
                if grp_cols and "nb_postes_ouverts" in etab_enrichi.columns:
                    reg_stats = etab_enrichi.groupby(grp_cols)["nb_postes_ouverts"].sum().reset_index()
                    reg_stats = reg_stats.sort_values("nb_postes_ouverts", ascending=False)
                    x_col = COL_ETAB_DEPT if (self.cmb_region.currentIndex() > 0 and COL_ETAB_DEPT in reg_stats.columns) else COL_ETAB_REGION
                    color_col = COL_ETAB_DEPT if (self.cmb_region.currentIndex() == 0 and COL_ETAB_DEPT in reg_stats.columns) else None
                    fig = px.bar(
                        reg_stats,
                        x=x_col,
                        y="nb_postes_ouverts",
                        color=color_col,
                        title=f"🇨🇲 Répartition Géographique des Besoins — Vue {scope}",
                        labels={"nb_postes_ouverts": "Besoins (Postes Ouverts)", x_col: "Territoire"},
                        barmode="stack"
                    )
                    self.chart_carto.set_figure(fig)
                else:
                    fig = px.bar(etab_enrichi.head(20), x=COL_ETAB_ID, y="nb_postes_ouverts" if "nb_postes_ouverts" in etab_enrichi.columns else None,
                                 title=f"🇨🇲 Répartition des Besoins — Vue {scope}")
                    self.chart_carto.set_figure(fig)

        def setup_tab_vivier(self):
            lay = QVBoxLayout(self.tab_vivier)
            c_viv = QHBoxLayout()
            self.chart_ages = ChartViewWidget("Pyramide des Âges")
            self.chart_baremes = ChartViewWidget("Distribution des Barèmes")
            c_viv.addWidget(self.chart_ages)
            c_viv.addWidget(self.chart_baremes)
            lay.addLayout(c_viv)

        def update_tab_vivier(self):
            vivier_df = self.resultat["vivier"]
            s = self.resultat.get("synthese", {})
            scope = s.get("scope_title", "National")

            if HAS_PLOTLY:
                if not vivier_df.empty and "_age" in vivier_df.columns:
                    fig1 = px.histogram(vivier_df, x="_age", color="affecte" if "affecte" in vivier_df.columns else None,
                                        nbins=20, title=f"Pyramide des Âges du Vivier — Vue {scope}")
                    self.chart_ages.set_figure(fig1)
                else:
                    fig1 = go.Figure()
                    fig1.add_annotation(text=f"Aucun enseignant dans ce périmètre ({scope})",
                                        xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
                                        font=dict(size=14, color="#94A3B8"))
                    fig1.update_layout(title=f"Pyramide des Âges — Vue {scope}")
                    self.chart_ages.set_figure(fig1)

                if not vivier_df.empty and "bareme" in vivier_df.columns:
                    fig2 = px.histogram(vivier_df, x="bareme", nbins=20,
                                        title=f"Distribution des Barèmes — Vue {scope}")
                    self.chart_baremes.set_figure(fig2)
                else:
                    fig2 = go.Figure()
                    fig2.add_annotation(text=f"Aucun barème disponible ({scope})",
                                        xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
                                        font=dict(size=14, color="#94A3B8"))
                    fig2.update_layout(title=f"Distribution des Barèmes — Vue {scope}")
                    self.chart_baremes.set_figure(fig2)

        def setup_tab_ecoles(self):
            lay = QVBoxLayout(self.tab_ecoles)
            self.chart_top_ecoles = ChartViewWidget("Top 10 Écoles nécessiteuses")
            lay.addWidget(self.chart_top_ecoles)

        def update_tab_ecoles(self):
            besoin_df = self.resultat["ecoles_en_besoin"]
            s = self.resultat.get("synthese", {})
            scope = s.get("scope_title", "National")

            if HAS_PLOTLY:
                if not besoin_df.empty and "nb_postes_ouverts" in besoin_df.columns:
                    top = besoin_df.sort_values("nb_postes_ouverts", ascending=False).head(10)
                    fig = px.bar(top, x="nb_postes_ouverts", y=COL_ETAB_ID, orientation="h",
                                 title=f"Top 10 Écoles Nécessiteuses — Vue {scope}",
                                 labels={"nb_postes_ouverts": "Postes Ouverts", COL_ETAB_ID: "Établissement"})
                    self.chart_top_ecoles.set_figure(fig)
                else:
                    fig = go.Figure()
                    fig.add_annotation(text=f"Aucune école en besoin dans ce périmètre ({scope})",
                                        xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False,
                                        font=dict(size=14, color="#94A3B8"))
                    fig.update_layout(title=f"Top 10 Écoles Nécessiteuses — Vue {scope}")
                    self.chart_top_ecoles.set_figure(fig)

        def setup_tab_export(self):
            lay = QVBoxLayout(self.tab_export)
            h_btn = QHBoxLayout()
            btn_dl = QPushButton("⬇️ Télécharger le Bilan Officiel (.xlsx)")
            btn_dl.setProperty("class", "primary")
            btn_dl.clicked.connect(self.download_excel)
            h_btn.addWidget(btn_dl)
            h_btn.addStretch()
            lay.addLayout(h_btn)

            self.tbl_aff = QTableWidget()
            lay.addWidget(self.tbl_aff)

        def update_tab_export(self):
            aff_df = self.resultat["affectations"]
            self._populate_table(self.tbl_aff, aff_df)


        def download_excel(self):
            if not self.resultat:
                return
            scope_s = self.resultat.get("synthese", {}).get("scope_title", "National").replace(" ", "_")
            default_name = f"affectation_{scope_s}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
            fpath, _ = QFileDialog.getSaveFileName(self, "Enregistrer le bilan Excel", default_name, "Fichier Excel (*.xlsx)")
            if fpath:
                try:
                    raw_bytes = export_excel_bytes(self.resultat)
                    with open(fpath, "wb") as f:
                        f.write(raw_bytes)
                    QMessageBox.information(self, "Exportation", f"Bilan sauvegardé avec succès dans :\n{fpath}")
                except Exception as e:
                    QMessageBox.critical(self, "Erreur", str(e))

        def setup_tab_projections(self):
            lay = QVBoxLayout(self.tab_proj)
            lbl_info = QLabel("<b>🔮 Projections N à N+3</b> — Modélisation prévisionnelle conforme au format officiel (Blocs A à E)")
            lbl_info.setStyleSheet("color: #38BDF8; font-size: 13px; margin-bottom: 6px;")
            lay.addWidget(lbl_info)
            self.tbl_proj = QTableWidget()
            lay.addWidget(self.tbl_proj)

        def update_tab_projections(self):
            proj_df = self.resultat.get("projections_n3", pd.DataFrame())
            self._populate_table(self.tbl_proj, proj_df)

        def setup_tab_audit(self):
            lay = QVBoxLayout(self.tab_audit)
            lbl_info = QLabel("<b>📜 Journal d'Audit (§5.4)</b> — Traçabilité exhaustive des arbitrages et dérogations")
            lbl_info.setStyleSheet("color: #38BDF8; font-size: 13px; margin-bottom: 6px;")
            lay.addWidget(lbl_info)
            self.tbl_audit = QTableWidget()
            lay.addWidget(self.tbl_audit)

        def update_tab_audit(self):
            audit_df = self.resultat.get("journal_audit", pd.DataFrame())
            self._populate_table(self.tbl_audit, audit_df)

        def setup_tab_ia(self):
            lay = QVBoxLayout(self.tab_ia)
            lbl_info = QLabel("<b>🤖 Module IA Décisionnel (Gemini 2.5)</b>")
            lbl_info.setStyleSheet("color: #38BDF8; font-size: 14px; margin-bottom: 8px;")
            lay.addWidget(lbl_info)

            h_act = QHBoxLayout()
            self.btn_note_ia = QPushButton("✨ Note ministérielle")
            self.btn_note_ia.setProperty("class", "primary")
            self.btn_note_ia.clicked.connect(self.trigger_note_ia)
            self.btn_audit_ia = QPushButton("🔍 Audit équité")
            self.btn_audit_ia.clicked.connect(self.trigger_audit_ia)
            h_act.addWidget(self.btn_note_ia)
            h_act.addWidget(self.btn_audit_ia)
            h_act.addStretch()
            lay.addLayout(h_act)

            h_q = QHBoxLayout()
            self.txt_copilot_q = QLineEdit()
            self.txt_copilot_q.setPlaceholderText("Poser une question sur la campagne d'affectation...")
            btn_ask_copilot = QPushButton("💬 Interroger KoSIG")
            btn_ask_copilot.clicked.connect(self.trigger_copilot_ia)
            h_q.addWidget(self.txt_copilot_q)
            h_q.addWidget(btn_ask_copilot)
            lay.addLayout(h_q)

            self.txt_ia_output = QTextBrowser()
            self.txt_ia_output.setPlaceholderText("Les analyses générées par l'intelligence artificielle apparaîtront ici...")
            lay.addWidget(self.txt_ia_output)

        def trigger_note_ia(self):
            key = self.txt_gemini_key.text().strip()
            client = initialiser_client_ia(key)
            if client is None:
                QMessageBox.warning(self, "Clé API", "Veuillez configurer une clé API Gemini valide dans la barre latérale.")
                return
            self.txt_ia_output.setMarkdown("⏳ *Génération de la note stratégique en cours...*")
            s = self.resultat["synthese"]
            besoin_df = self.resultat["ecoles_en_besoin"]
            aff_df = self.resultat["affectations"]
            self.ai_worker = AIWorker(generer_note_strategique_ia, client, s, besoin_df, aff_df)
            self.ai_worker.finished.connect(lambda txt: self.txt_ia_output.setMarkdown(txt))
            self.ai_worker.error.connect(lambda err: self.txt_ia_output.setPlainText(f"Erreur IA : {err}"))
            self.ai_worker.start()

        def trigger_audit_ia(self):
            key = self.txt_gemini_key.text().strip()
            client = initialiser_client_ia(key)
            if client is None:
                QMessageBox.warning(self, "Clé API", "Veuillez configurer une clé API Gemini valide dans la barre latérale.")
                return
            self.txt_ia_output.setMarkdown("⏳ *Audit d'équité en cours...*")
            besoin_df = self.resultat["ecoles_en_besoin"]
            aff_df = self.resultat["affectations"]
            self.ai_worker = AIWorker(auditer_equite_et_derogations_ia, client, aff_df, besoin_df)
            self.ai_worker.finished.connect(lambda txt: self.txt_ia_output.setMarkdown(txt))
            self.ai_worker.error.connect(lambda err: self.txt_ia_output.setPlainText(f"Erreur IA : {err}"))
            self.ai_worker.start()

        def trigger_copilot_ia(self):
            key = self.txt_gemini_key.text().strip()
            q = self.txt_copilot_q.text().strip()
            if not q:
                return
            client = initialiser_client_ia(key)
            if client is None:
                QMessageBox.warning(self, "Clé API", "Veuillez configurer une clé API Gemini valide dans la barre latérale.")
                return
            self.txt_ia_output.setMarkdown(f"⏳ *Analyse de la question : « {q} »...*")
            s = self.resultat["synthese"]
            aff_df = self.resultat["affectations"]
            etab_df = self.resultat["etab_enrichi"]
            self.ai_worker = AIWorker(interroger_copilot_ia, client, q, s, aff_df, etab_df)
            self.ai_worker.finished.connect(lambda txt: self.txt_ia_output.setMarkdown(txt))
            self.ai_worker.error.connect(lambda err: self.txt_ia_output.setPlainText(f"Erreur IA : {err}"))
            self.ai_worker.start()

        def _populate_table(self, tbl: QTableWidget, df: pd.DataFrame):
            if df.empty:
                tbl.setRowCount(0)
                tbl.setColumnCount(0)
                return
            tbl.setColumnCount(len(df.columns))
            tbl.setRowCount(len(df))
            tbl.setHorizontalHeaderLabels([str(c) for c in df.columns])
            for r_idx in range(len(df)):
                for c_idx in range(len(df.columns)):
                    val = df.iat[r_idx, c_idx]
                    tbl.setItem(r_idx, c_idx, QTableWidgetItem(str(val) if pd.notna(val) else ""))
            tbl.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)


    # ============================================================
    # POINT D'ENTRÉE PRINCIPAL
    # ============================================================

    def main():
        # Identification de l application sous Windows pour la barre des taches
        if sys.platform == "win32":
            try:
                import ctypes
                myappid = "minedub.parec.algoplanr.2.1"
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
            except Exception:
                pass

        try:
            QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
        except Exception:
            pass

        app = QApplication(sys.argv)
        app.setApplicationName("AlgoPlanR")
        app.setOrganizationName("MINEDUB-PAREC")

        # Definition de l icone globale de l application
        icon_path = trouver_chemin_logo("app_icon.ico")
        if not (icon_path and os.path.exists(icon_path)):
            icon_path = trouver_chemin_logo("algoR.png")
        if icon_path and os.path.exists(icon_path):
            app.setWindowIcon(QIcon(icon_path))

        window = MainWindow()
        window.show()
        sys.exit(app.exec())


if __name__ == "__main__":
    if HAS_PYSIDE6:
        main()
    else:
        print("Erreur: PySide6 n'est pas installé. Veuillez installer PySide6 via pip install PySide6")
