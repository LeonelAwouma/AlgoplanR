"""Prépare un fichier d'activation signé (à exécuter sur la machine de l'administrateur, avec la clé privée).

Exemples :
    # Poste du DRH (postes autonomes) : le seul compte DRH, mot de passe temporaire tiré au hasard, lié au poste
    python manage.py acces_preparer_activation --cle-privee D:\\admin\\cle_privee_activation.pem \\
        --type initiale --compte drh:DRH::"Direction des ressources humaines" --poste <identifiant du poste> \\
        --sortie activation-drh.algoplanr-activation

    # Récupération du mot de passe du DRH (liaison au poste obligatoire, usage unique)
    python manage.py acces_preparer_activation ... --type reinitialisation --cible drh --poste <identifiant>

    # Tests : DRH seul (--drh-test) ou DRH + 10 délégués (--comptes-test), mot de passe temporaire 123456
    python manage.py acces_preparer_activation --cle-privee D:\\admin\\cle_privee_activation.pem \\
        --type initiale --comptes-test --sortie activation-initiale.algoplanr-activation

    # Production : comptes explicites, mots de passe temporaires tirés au hasard (affichés une seule fois)
    python manage.py acces_preparer_activation ... --type initiale \\
        --compte drh:DRH::"Direction des ressources humaines" --compte delegue.centre:DELEGUE:Centre

    python manage.py acces_preparer_activation ... --type reaffectation --cible delegue.centre --region Littoral
    python manage.py acces_preparer_activation ... --type revocation --cible delegue.centre
    python manage.py acces_preparer_activation ... --type reinitialisation --cible delegue.centre

Les mots de passe temporaires ne figurent dans le fichier que hachés. Aucun fichier ni mot de passe n'expire.
"""
from __future__ import annotations

import getpass
import secrets
import uuid
from pathlib import Path

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from contextes.acces.activation import ACTIONS_PAR_TYPE, FORMAT, VERSION, signer
from contextes.acces.models import ROLE_DELEGUE, ROLE_DRH
from domaine.acces.regions import REGIONS_CAMEROUN, identifiant_delegue, region_canonique

MOT_DE_PASSE_TEST = "123456"
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

__all__ = ["Command", "cle_privee_pem", "identifiant_delegue"]


class Command(BaseCommand):
    help = "Prépare un fichier d'activation AlgoPlanR signé par la clé privée de l'administration."

    def add_arguments(self, parser):
        parser.add_argument("--cle-privee", required=True)
        parser.add_argument("--type", required=True, choices=sorted(ACTIONS_PAR_TYPE))
        parser.add_argument("--sortie", required=True)
        parser.add_argument("--comptes-test", action="store_true",
                            help="DRH + 10 délégués, mot de passe temporaire 123456 (tests uniquement)")
        parser.add_argument("--drh-test", action="store_true",
                            help="DRH seul, mot de passe temporaire 123456 (tests des postes autonomes)")
        parser.add_argument("--poste", help="Identifiant du poste destinataire (obligatoire pour une réinitialisation)")
        parser.add_argument("--cle-carnet", help="Fichier de la clé du carnet embarqué, remise au DRH dans ce fichier")
        parser.add_argument("--compte", action="append", default=[],
                            help="identifiant:ROLE[:Region[:Nom affiché]] (création de compte)")
        parser.add_argument("--cible", action="append", default=[], help="Compte visé (réaffectation, révocation…)")
        parser.add_argument("--region", help="Nouvelle région (réaffectation)")
        parser.add_argument("--saisir-mot-de-passe", action="store_true",
                            help="Saisir le mot de passe temporaire au lieu de le tirer au hasard")

    def _temporaire(self, o, identifiant: str, test: bool) -> str:
        if test:
            return MOT_DE_PASSE_TEST
        if o["saisir_mot_de_passe"]:
            return getpass.getpass(f"Mot de passe temporaire pour {identifiant} : ")
        valeur = "".join(secrets.choice(ALPHABET) for _ in range(12))
        self.stdout.write(f"  {identifiant} : mot de passe temporaire {valeur}  (à transmettre, il ne sera plus affiché)")
        return valeur

    def _mot_de_passe(self, o, identifiant: str, test: bool, drh: bool) -> dict:
        """Empreinte du mot de passe temporaire et, pour le DRH, clé du carnet enveloppée par ce mot de passe."""
        temporaire = self._temporaire(o, identifiant, test)
        champs = {"mot_de_passe_hache": make_password(temporaire)}
        if drh and o["cle_carnet"]:
            from domaine.acces.codes import envelopper
            cle = Path(o["cle_carnet"]).read_text(encoding="utf-8").strip()
            champs["carnet"] = envelopper(cle.encode("utf-8"), temporaire)
        return champs

    def handle(self, *args, **o):
        type_ = o["type"]
        maintenant = timezone.now()
        if type_ == "reinitialisation" and not o["poste"]:
            raise CommandError("Un fichier de réinitialisation doit être lié au poste : --poste <identifiant>.")
        operations = []
        if type_ in ("initiale", "ajout"):
            comptes = []
            test = o["comptes_test"] or o["drh_test"]
            if o["drh_test"]:
                comptes.append(("drh", ROLE_DRH, None, "DRH national"))
            if o["comptes_test"]:
                comptes.append(("drh", ROLE_DRH, None, "DRH national"))
                comptes += [(identifiant_delegue(r), ROLE_DELEGUE, r, f"Délégué régional — {r}")
                            for r in REGIONS_CAMEROUN]
            for brut in o["compte"]:
                morceaux = (brut.split(":") + ["", "", ""])[:4]
                ident, role, region, nom = (m.strip() for m in morceaux)
                role = role.upper()
                if role not in (ROLE_DRH, ROLE_DELEGUE):
                    raise CommandError(f"Rôle invalide pour {ident} : {role}")
                if role == ROLE_DELEGUE and region_canonique(region) is None:
                    raise CommandError(f"Région inconnue pour {ident} : {region}")
                comptes.append((ident.lower(), role, region_canonique(region) if role == ROLE_DELEGUE else None, nom))
            if not comptes:
                raise CommandError("Aucun compte : utilisez --comptes-test ou --compte.")
            for ident, role, region, nom in comptes:
                operations.append({
                    "action": "creer_compte", "identifiant": ident, "role": role, "region": region,
                    "nom_affiche": nom,
                    **self._mot_de_passe(o, ident, test, role == ROLE_DRH)})
        else:
            if not o["cible"]:
                raise CommandError("Indiquez le ou les comptes visés avec --cible.")
            for ident in o["cible"]:
                if type_ == "reaffectation":
                    region = region_canonique(o["region"])
                    if region is None:
                        raise CommandError(f"Région inconnue : {o['region']}")
                    operations.append({"action": "reaffecter", "identifiant": ident, "region": region})
                elif type_ == "revocation":
                    operations.append({"action": "revoquer", "identifiant": ident})
                else:
                    operations.append({"action": "reinitialiser", "identifiant": ident,
                                       **self._mot_de_passe(o, ident, False, True)})
        charge = {"format": FORMAT, "version": VERSION, "id": str(uuid.uuid4()), "type": type_,
                  "emise_le": maintenant.isoformat(), "operations": operations}
        if o["poste"]:
            charge["poste"] = str(uuid.UUID(o["poste"]))
        Path(o["sortie"]).write_bytes(signer(charge, cle_privee_pem(o["cle_privee"])))
        lien = f", lié au poste {charge['poste']}" if o["poste"] else ""
        self.stdout.write(f"Fichier d'activation « {type_} » écrit : {o['sortie']} "
                          f"({len(operations)} opération(s), sans expiration{lien})")


def cle_privee_pem(chemin: str) -> bytes:
    """Clé privée de l'administration, déchiffrée si elle est protégée par une phrase secrète."""
    try:
        cle = Path(chemin).read_bytes()
    except OSError as exc:
        raise CommandError(f"Clé privée illisible : {exc}")
    if b"ENCRYPTED" in cle:
        from cryptography.hazmat.primitives import serialization

        phrase = getpass.getpass("Phrase secrète de la clé privée : ").encode("utf-8")
        try:
            dechiffree = serialization.load_pem_private_key(cle, password=phrase)
        except ValueError:
            raise CommandError("Phrase secrète incorrecte.")
        cle = dechiffree.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption())
    return cle
