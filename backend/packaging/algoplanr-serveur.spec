# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Répertoire backend/ (le fichier .spec se trouve dans backend/packaging/)
RACINE_BACKEND = Path(SPECPATH).resolve().parent
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

# Ressources des bibliothèques Django
datas += collect_data_files("rest_framework")
datas += collect_data_files("drf_spectacular")
datas += collect_data_files("django")

# Modules nécessaires au backend
hiddenimports = [
    "waitress",
    "python_calamine",
    "openpyxl",
]

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
