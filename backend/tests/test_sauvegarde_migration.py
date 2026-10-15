"""Mise à jour d'un poste : la base est sauvegardée avant la migration des accès, et aucune donnée n'est perdue.

Le scénario tourne dans des sous-processus, sur une base SQLite à part : un poste « ancien » (migrations des accès
arrêtées avant les postes autonomes) contenant un jeu et un compte, puis le démarrage du serveur mis à jour.
"""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def _manage(env, *args):
    r = subprocess.run([sys.executable, "manage.py", *args], cwd=RACINE, env=env, capture_output=True, text=True,
                       timeout=300)
    assert r.returncode == 0, r.stderr[-2000:]
    return r.stdout


def test_sauvegarde_avant_migration_et_aucune_perte(tmp_path):
    env = {**os.environ, "ALGOPLANR_DATA_DIR": str(tmp_path), "ALGOPLANR_DB": str(tmp_path / "poste.sqlite3"),
           "ALGOPLANR_JETON": ""}
    _manage(env, "migrate", "--noinput")
    _manage(env, "migrate", "acces", "0001", "--noinput")           # poste d'avant les postes autonomes
    base = sqlite3.connect(tmp_path / "poste.sqlite3")
    base.execute("INSERT INTO donnees_jeudedonnees (id, nom, source, cree_le, portee, region, consolide_depuis, statut,"
                 " valide_le, valide_par) VALUES ('0123456789abcdef0123456789abcdef', 'Jeu conservé', 'import',"
                 " '2026-10-01 08:00:00', 'regional', 'Centre', '[]', 'brouillon', NULL, '')")
    base.commit()
    base.close()

    code = ("import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'algoplanr.settings'); django.setup();"
            "from algoplanr.serveur import migrer_avec_sauvegarde; migrer_avec_sauvegarde()")
    r = subprocess.run([sys.executable, "-c", code], cwd=RACINE, env=env, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-2000:]
    assert "ALGOPLANR_SAUVEGARDE" in r.stdout
    copies = list((tmp_path / "sauvegardes").glob("avant-migration-*.sqlite3"))
    assert len(copies) == 1
    for chemin, nouvelles_tables in ((copies[0], False), (tmp_path / "poste.sqlite3", True)):
        con = sqlite3.connect(chemin)
        assert con.execute("SELECT nom FROM donnees_jeudedonnees").fetchall() == [("Jeu conservé",)]
        tables = {t for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert ("acces_codeconsomme" in tables) is nouvelles_tables
        con.close()
