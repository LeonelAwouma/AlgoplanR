# -*- mode: python ; coding: utf-8 -*-

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Répertoire backend/ (le fichier .spec se trouve dans backend/packaging/)
RACINE_BACKEND = Path(SPECPATH).resolve().parent

# `collect_submodules("algoplanr" | "contextes" | "domaine")` ci-dessous importe ces paquets pendant l'exécution du .spec,
# AVANT que `Analysis(pathex=...)` ne soit pris en compte : sans cette ligne, un build lancé depuis un autre dossier
# que backend/ (par ex. backend/packaging) collecte une liste vide et l'exécutable démarre sans algoplanr.settings
# (« ModuleNotFoundError: No module named 'algoplanr.settings' »).
sys.path.insert(0, str(RACINE_BACKEND))
DOSSIER_ACCES = RACINE_BACKEND / "contextes" / "acces"

# Ressources nécessaires à l'activation hors ligne d'AlgoPlanR
FICHIERS_ACCES = [
    "cle_publique_activation.pem",
    "catalogue_codes.algoplanr-catalogue",
    "carnet_codes.algoplanr-carnet",
]

datas = []

for nom_fichier in FICHIERS_ACCES:
    chemin = DOSSIER_ACCES / nom_fichier

    if not chemin.is_file():
        raise FileNotFoundError(
            f"Ressource d'activation introuvable : {chemin}"
        )

    datas.append((str(chemin), "contextes/acces"))

# python-docx lit ses gabarits par `docx/parts/../templates/*.xml` : le dossier `docx/parts` doit exister dans le
# dossier de l'exécutable (sinon, hors Windows, l'export Word échoue en FileNotFoundError). Un marqueur le crée.
datas.append((str(RACINE_BACKEND / "packaging" / "docx_parts_marqueur.txt"), "docx/parts"))
datas += collect_data_files("docx")

# Ressources des bibliothèques Django
datas += collect_data_files("rest_framework")
datas += collect_data_files("drf_spectacular")
datas += collect_data_files("django")

# Modules nécessaires au backend
hiddenimports = [
    "waitress",
    "python_calamine",
    "openpyxl",
    "docx",          # exports Word (lot 4) ; gabarits XML collectés par le hook officiel hook-docx.py
    "lxml.etree",    # dépendance de python-docx ; hook officiel hook-lxml.py
]

# Garde-fou : un paquet métier introuvable ferait un exécutable qui ne démarre pas ; on préfère échouer au build.
for paquet in ("algoplanr", "contextes", "domaine"):
    if not collect_submodules(paquet):
        raise SystemExit(f"Build interrompu : aucun module collecté pour le paquet « {paquet} » (sys.path : {RACINE_BACKEND}).")

hiddenimports += collect_submodules("algoplanr")
hiddenimports += collect_submodules("contextes")
hiddenimports += collect_submodules("domaine")
hiddenimports += collect_submodules("rest_framework")
hiddenimports += collect_submodules("drf_spectacular")
hiddenimports += collect_submodules("corsheaders")
hiddenimports += collect_submodules("whitenoise")
hiddenimports += collect_submodules("django.db.backends.sqlite3")

# Analyse des dépendances Python
a = Analysis(
    [str(RACINE_BACKEND / "packaging" / "lancer_serveur.py")],
    pathex=[str(RACINE_BACKEND)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter", "matplotlib"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# Génération de l'exécutable Django
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="algoplanr-serveur",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# Construction du dossier autonome
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="algoplanr-serveur",
)
