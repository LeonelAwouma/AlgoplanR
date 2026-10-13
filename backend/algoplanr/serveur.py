"""Point d'entrée du backend (waitress) : python -m algoplanr.serveur [--port 8000]."""
from __future__ import annotations

import argparse
import os
import socket


def port_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Serveur AlgoPlanR")
    parser.add_argument("--port", type=int, default=int(os.environ.get("ALGOPLANR_PORT", 8000)),
                        help="0 = port libre choisi automatiquement")
    parser.add_argument("--hote", default="127.0.0.1")
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "algoplanr.settings")
    import django
    django.setup()
    from django.core.management import call_command
    call_command("migrate", interactive=False, verbosity=0)

    from waitress import serve
    from algoplan.wsgi import application
    port = args.port or port_libre()
    # Ligne lue par Electron pour connaître le port choisi.
    print(f"ALGOPLANR_PRET http://{args.hote}:{port}", flush=True)
    serve(application, host=args.hote, port=port, threads=4)


if __name__ == "__main__":
    main()
