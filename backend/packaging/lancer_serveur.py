"""Point d'entrée figé par PyInstaller : lance le serveur AlgoPlanR (waitress) comme `python -m algoplanr.serveur`."""
import multiprocessing

from algoplanr.serveur import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
