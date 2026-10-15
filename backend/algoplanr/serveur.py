"""Point d'entrée du backend (waitress) : python -m algoplanr.serveur [--port 8000]."""
from __future__ import annotations

import argparse
import os
import socket


def port_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def migrer_avec_sauvegarde() -> None:
    """Applique les migrations en attente, après une copie complète de la base SQLite.

    Une mise à jour de l'application ne doit jamais faire perdre de données : la base est sauvegardée dans
    `<dossier de données>/sauvegardes/` avant toute migration. Si une migration échoue, le serveur s'arrête
    sans rien supprimer ; la sauvegarde permet de revenir à l'état antérieur.
    """
    import sqlite3
    import sys
    from datetime import datetime
    from pathlib import Path

    from django.conf import settings
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    en_attente = executor.migration_plan(executor.loader.graph.leaf_nodes())
    base = Path(settings.DATABASES["default"]["NAME"])
    if en_attente and base.exists() and base.stat().st_size > 0:
        dossier = Path(settings.DATA_DIR) / "sauvegardes"
        dossier.mkdir(parents=True, exist_ok=True)
        copie = dossier / f"avant-migration-{datetime.now():%Y%m%d-%H%M%S}.sqlite3"
        source, cible = sqlite3.connect(base), sqlite3.connect(copie)
        try:
            source.backup(cible)
        finally:
            cible.close()
            source.close()
        print(f"ALGOPLANR_SAUVEGARDE {copie}", flush=True)
    try:
        call_command("migrate", interactive=False, verbosity=0)
    except Exception as exc:  # la base reste intacte grâce aux transactions de migration et à la sauvegarde
        print(f"ALGOPLANR_ERREUR migration impossible : {exc}", file=sys.stderr, flush=True)
        raise SystemExit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serveur AlgoPlanR")
    parser.add_argument("--port", type=int, default=int(os.environ.get("ALGOPLANR_PORT", 8000)),
                        help="0 = port libre choisi automatiquement")
    parser.add_argument("--hote", default="127.0.0.1")
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "algoplanr.settings")
    import django
    django.setup()
    migrer_avec_sauvegarde()

    from waitress import serve
    from algoplanr.wsgi import application
    port = args.port or port_libre()
    # Ligne lue par Electron pour connaître le port choisi.
    print(f"ALGOPLANR_PRET http://{args.hote}:{port}", flush=True)
    serve(application, host=args.hote, port=port, threads=4)


if __name__ == "__main__":
    main()
