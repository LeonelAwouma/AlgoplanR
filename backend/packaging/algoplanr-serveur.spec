# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files
from PyInstaller.utils.hooks import collect_submodules

datas = [('C:/Users/MARCOM/Downloads/Compressed/AlgoplanR-main/AlgoplanR-main/backend/contextes/acces/cle_publique_activation.pem', 'contextes/acces'), ('C:/Users/MARCOM/Downloads/Compressed/AlgoplanR-main/AlgoplanR-main/backend/contextes/acces/catalogue_codes.algoplanr-catalogue', 'contextes/acces')]
hiddenimports = ['waitress', 'python_calamine', 'openpyxl']
datas += collect_data_files('rest_framework')
datas += collect_data_files('drf_spectacular')
datas += collect_data_files('django')
hiddenimports += collect_submodules('algoplanr')
hiddenimports += collect_submodules('contextes')
hiddenimports += collect_submodules('domaine')
hiddenimports += collect_submodules('rest_framework')
hiddenimports += collect_submodules('drf_spectacular')
hiddenimports += collect_submodules('corsheaders')
hiddenimports += collect_submodules('whitenoise')
hiddenimports += collect_submodules('django.db.backends.sqlite3')


a = Analysis(
    ['lancer_serveur.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['pytest', 'tkinter', 'matplotlib'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='algoplanr-serveur',
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
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='algoplanr-serveur',
)
