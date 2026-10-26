"""Contrôles sur la base nationale MINEDUB réelle (établissements seuls), comparaison des deux modes d'import et
mesures de performance.

Ces tests passent par l'API HTTP, comme l'interface. Ils ne fabriquent aucune donnée nationale : sans le fichier réel,
ils sont ignorés (et le disent). Il n'existe pas de fichier nominatif national : le mode complet n'est donc contrôlé
que sur un jeu fictif, jamais présenté comme un résultat réel. Les mesures sont écrites dans le dossier désigné par
ALGOPLANR_RAPPORT_DIR (par défaut /mnt/project-files/validation-d7 s'il existe)."""
import io
import json
import os
import time
from pathlib import Path

import pandas as pd
import pytest

from domaine.donnees.demonstration import construire_jeu_demonstration
from tests.outils_acces import B

pytestmark = pytest.mark.django_db

J = "application/json"
NATIONAL = Path("/mnt/project-files/securite/etablissements_national_formates.xlsx")
RAPPORT = Path(os.environ.get("ALGOPLANR_RAPPORT_DIR", "/mnt/project-files/validation-d7"))
absent = pytest.mark.skipif(not NATIONAL.exists(), reason=f"Fichier national réel introuvable : {NATIONAL}")
MESURES: dict = {}


def _noter(cle, valeur):
    MESURES[cle] = valeur
    if RAPPORT.is_dir():
        (RAPPORT / "mesures-tests-nationaux.json").write_text(
            json.dumps(MESURES, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


def _importer(client, chemin_ou_flux, type_fichier="etablissements", **extra):
    if isinstance(chemin_ou_flux, Path):
        with open(chemin_ou_flux, "rb") as f:
            r = client.post(B + "fichiers/", {"type": type_fichier, "fichier": f, **extra})
    else:
        r = client.post(B + "fichiers/", {"type": type_fichier, "fichier": chemin_ou_flux, **extra})
    assert r.status_code == 201, r.content[:400]
    return r.json()


def _xlsx(lignes, nom):
    tampon = io.BytesIO()
    pd.DataFrame(lignes).to_excel(tampon, index=False)
    tampon.name = nom
    tampon.seek(0)
    return tampon


def _creer(client, fichiers, **extra):
    t = time.perf_counter()
    r = client.post(B + "jeux/", {**fichiers, "sens_annee_scolaire": "donnees", **extra}, content_type=J)
    assert r.status_code == 201, r.content[:500]
    return r.json(), round(time.perf_counter() - t, 2)


def _lire(client, url):
    t = time.perf_counter()
    r = client.get(B + url)
    assert r.status_code == 200, (url, r.status_code, r.content[:300])
    return r.json(), round(time.perf_counter() - t, 2)


# --- Test A : base nationale réelle, établissements seuls --------------------------------------------------------

@absent
def test_a_base_nationale_reelle_en_etablissements_seuls(drh):
    source = pd.read_excel(NATIONAL, engine="openpyxl")
    fichier = _importer(drh, NATIONAL, base_nationale="true")
    jeu, duree_creation = _creer(drh, {"fichier_etablissements": fichier["id"]}, annee_scolaire="2024-2025")
    jid = jeu["id"]

    # Import, mode et identifiants
    assert jeu["mode_import"] == "etablissements_seuls" and jeu["nominatif_disponible"] is False
    assert jeu["nb_enseignants"] is None
    assert jeu["nb_etablissements"] == len(source) == source["Identifiant_Ecole"].nunique()
    from contextes.donnees.models import Etablissement
    assert set(Etablissement.objects.filter(jeu_id=jid).values_list("id_ecole", flat=True)) == {
        str(i) for i in source["Identifiant_Ecole"]}
    # Pas de colonne ajoutée ni de Nombre_Groupes_Pedagogiques
    diag, t_diag = _lire(drh, f"jeux/{jid}/diagnostic/")
    assert "Nombre_Groupes_Pedagogiques" not in json.dumps(diag)

    # Territoire
    arbre, _ = _lire(drh, f"jeux/{jid}/territoires/arbre/")
    niveaux = {}

    def parcourir(n):
        niveaux[n["niveau"]] = niveaux.get(n["niveau"], 0) + 1
        for c in n["enfants"]:
            parcourir(c)
    parcourir(arbre)
    assert niveaux["region"] == source["Region"].nunique() == 10
    assert niveaux["departement"] == source["Departement"].nunique()
    tot = arbre["totaux"]
    assert tot["nb_ecoles"] == len(source)

    # Élèves, salles, besoin
    assert tot["effectif_total_eleves"] == float(source["Effectif_Eleves_Attendus"].sum())
    sans_effectif = int(source["Effectif_Eleves_Attendus"].isna().sum())
    assert jeu["donnees_manquantes"]["ecoles_sans_effectif"] == sans_effectif
    assert tot["enseignants_en_poste"] == int(source["Enseignants_Actuels"].sum())   # stock déclaré
    # Classes multigrades : jamais 0 faute de source
    assert tot["multigrades_non_renseignes"] == len(source) and tot["nb_ecoles_besoin_provisoire"] > 0
    prev, t_prev = _lire(drh, f"jeux/{jid}/planification/previsionnel/")
    assert len(prev["annees"]) == 6 and prev["annees"][0].startswith("Base (2024-2025)")
    lignes = {l["cle"]: l for g in prev["groupes"] for l in g["lignes"]}
    assert lignes["departs_retraite"]["valeurs"] == [None] * 6
    assert lignes["retraites_identifiees"]["valeurs"] == [None] * 6
    assert lignes["recrutement_min"]["valeurs"][1] is None and lignes["recrutement_maintien"]["valeurs"][1] is None
    assert lignes["recrutement_besoin"]["valeurs"][1] is not None            # conditionnel, calculé
    assert lignes["eleves"]["natures"][0] == "observe" and set(lignes["eleves"]["natures"][1:]) == {"projete"}
    # Fiabilité et départs
    fiab, _ = _lire(drh, f"jeux/{jid}/planification/fiabilite/")
    assert fiab["global"]["enseignants"] is None and fiab["global"]["taux_date_naissance"] is None
    departs, _ = _lire(drh, f"jeux/{jid}/planification/departs/")
    assert departs["retraites"] is None and departs["retraites_calculables"] is False
    plan, t_plan = _lire(drh, f"jeux/{jid}/planification/")
    assert all(a["departs_retraite"] is None for a in plan["annees"])
    # Exports
    t = time.perf_counter()
    x = drh.get(B + f"jeux/{jid}/rapports/territorial/export/?format=xlsx")
    d = drh.get(B + f"jeux/{jid}/rapports/territorial/export/?format=docx")
    t_export = round(time.perf_counter() - t, 2)
    assert x.status_code == 200 and d.status_code == 200 and len(x.content) > 5000 and len(d.content) > 5000
    # Fonctions nominatives refusées
    assert drh.get(B + f"jeux/{jid}/enseignants/").status_code == 422
    assert drh.get(B + f"jeux/{jid}/rapport/").status_code == 422

    _noter("test_a", {
        "fichier": str(NATIONAL), "ecoles": len(source), "identifiants_distincts": int(source["Identifiant_Ecole"].nunique()),
        "regions": niveaux["region"], "departements": niveaux["departement"],
        "arrondissements_du_fichier": int(source["Arrondissement"].nunique()),
        "noeuds_niveau_commune_de_l_arbre": niveaux.get("commune"),
        "ecoles_sans_effectif": sans_effectif, "eleves": tot["effectif_total_eleves"],
        "salles_simple_flux_declarees": float(source["Salles_Simple_Flux"].sum()),
        "enseignants_declares": tot["enseignants_en_poste"], "besoin_postes": tot["besoin_postes"],
        "besoin_confirme": tot["besoin_postes_confirme"], "besoin_provisoire": tot["besoin_postes_provisoire"],
        "ecoles_minimum_provisoire": tot["nb_ecoles_minimum_provisoire"],
        "ecoles_besoin_provisoire": tot["nb_ecoles_besoin_provisoire"],
        "dotation_theorique": tot["dotation_theorique"], "annees": prev["annees"],
        "eleves_projetes": lignes["eleves"]["valeurs"],
        "secondes": {"creation_jeu": duree_creation, "diagnostic": t_diag, "previsionnel": t_prev,
                     "planification": t_plan, "exports_xlsx_docx": t_export},
        "tailles_exports_octets": {"xlsx": len(x.content), "docx": len(d.content)},
    })


@absent
def test_a_variante_arrondissement_utilise_comme_commune(drh):
    """Le fichier porte 360 arrondissements dans « Arrondissement » mais une colonne « Commune » vide : la
    correspondance automatique retient « Commune ». Mesure ce que changerait l'indication manuelle de la colonne
    « Arrondissement » (action déjà offerte à l'utilisateur), sans modifier aucune règle."""
    def mesurer(correspondance):
        fichier = _importer(drh, NATIONAL, base_nationale="true")
        if correspondance:
            r = drh.patch(B + f"fichiers/{fichier['id']}/correspondances/", {"correspondance": correspondance},
                          content_type=J)
            assert r.status_code == 200, r.content[:300]
        jeu, _ = _creer(drh, {"fichier_etablissements": fichier["id"]}, annee_scolaire="2024-2025")
        arbre, _ = _lire(drh, f"jeux/{jeu['id']}/territoires/arbre/")
        communes = []

        def parcourir(n):
            if n["niveau"] == "commune":
                communes.append(n["libelle"])
            for c in n["enfants"]:
                parcourir(c)
        parcourir(arbre)
        rap, _ = _lire(drh, f"jeux/{jeu['id']}/planification/rapport/")
        return {"noeuds_arrondissement": len(communes), "non_renseignes": communes.count("(non renseigné)"),
                "redeployable_arrondissement": rap["redeploiement"]["national"]["redeployable_arrondissement"],
                "ecoles_sans_eleves": rap["redeploiement"]["national"].get("ecoles_sans_eleves")}
    automatique = mesurer(None)
    manuelle = mesurer({"Commune": "Arrondissement"})
    assert automatique["noeuds_arrondissement"] == 58 and manuelle["noeuds_arrondissement"] == 360
    _noter("test_a_variante_arrondissement", {"correspondance_automatique": automatique,
                                              "correspondance_Commune_vers_Arrondissement": manuelle})


# --- Test C : les deux modes sur les mêmes écoles (jeu FICTIF) ----------------------------------------------------

def _plat(o, chemin=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from _plat(v, f"{chemin}/{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from _plat(v, f"{chemin}[{i}]")
    else:
        yield chemin, o


def test_c_comparaison_des_deux_modes_sur_les_memes_ecoles_fictives(drh):
    etab, ens = construire_jeu_demonstration(11, 150, 900)
    fe = _importer(drh, _xlsx(etab, "etab.xlsx"))["id"]
    fn = _importer(drh, _xlsx(ens, "ens.xlsx"), "enseignants")["id"]
    complet, _ = _creer(drh, {"fichier_etablissements": fe, "fichier_enseignants": fn}, annee_scolaire="2025-2026",
                        donnees_fictives=True)
    fe2 = _importer(drh, _xlsx(etab, "etab.xlsx"))["id"]
    seul, _ = _creer(drh, {"fichier_etablissements": fe2}, annee_scolaire="2025-2026", donnees_fictives=True)

    ecarts = {"identiques": [], "difference_attendue": []}
    for nom, url in (("diagnostic", "diagnostic/"), ("previsionnel", "planification/previsionnel/")):
        a, _ = _lire(drh, f"jeux/{complet['id']}/{url}")
        b, _ = _lire(drh, f"jeux/{seul['id']}/{url}")
        pa, pb = dict(_plat(a)), dict(_plat(b))
        for cle in sorted(set(pa) | set(pb)):
            if pa.get(cle) == pb.get(cle):
                continue
            ecarts["difference_attendue"].append(f"{nom}{cle}")
    # Les indicateurs scolaires issus des écoles seules sont identiques dans les deux modes.
    arbre_c, _ = _lire(drh, f"jeux/{complet['id']}/territoires/arbre/")
    arbre_s, _ = _lire(drh, f"jeux/{seul['id']}/territoires/arbre/")
    scolaires = ("nb_ecoles", "besoin_postes", "salles_manquantes", "dotation_theorique", "effectif_total_eleves",
                 "enseignants_en_poste", "nb_ecoles_minimum_provisoire", "nb_ecoles_besoin_provisoire",
                 "multigrades_non_renseignes", "besoin_selon_rem")
    for k in scolaires:
        assert arbre_c["totaux"][k] == arbre_s["totaux"][k], k
    prev_c, _ = _lire(drh, f"jeux/{complet['id']}/planification/previsionnel/")
    prev_s, _ = _lire(drh, f"jeux/{seul['id']}/planification/previsionnel/")
    lc = {l["cle"]: l for g in prev_c["groupes"] for l in g["lignes"]}
    ls = {l["cle"]: l for g in prev_s["groupes"] for l in g["lignes"]}
    for cle in ("eleves", "croissance", "besoin_rem", "somme_pe", "somme_me", "somme_de", "somme_ke", "rem_reference"):
        assert lc[cle]["valeurs"] == ls[cle]["valeurs"], cle
    dependantes = [cle for cle in lc if lc[cle]["valeurs"] != ls.get(cle, {}).get("valeurs")]
    for cle in ("departs_retraite", "recrutement_min", "recrutement_maintien"):
        assert ls[cle]["valeurs"][1] is None and lc[cle]["valeurs"][1] is not None, cle
    _noter("test_c_jeu_fictif", {"ecoles": 150, "enseignants_fictifs": 900,
                                 "totaux_scolaires_identiques": list(scolaires),
                                 "lignes_previsionnel_identiques": ["eleves", "croissance", "besoin_rem", "somme_pe",
                                                                    "somme_me", "somme_de", "somme_ke",
                                                                    "rem_reference"],
                                 "lignes_dependant_du_nominatif": {
                                     cle: {"complet": lc[cle]["valeurs"][:4], "etablissements_seuls": ls[cle]["valeurs"][:4]}
                                     for cle in dependantes},
                                 "nombre_de_valeurs_differentes_diagnostic_et_previsionnel": len(
                                     ecarts["difference_attendue"])})


# --- Performance : 30 000 écoles / 40 000 enseignants (jeu FICTIF) ------------------------------------------------

def test_performance_30000_ecoles_40000_enseignants(drh):
    t = time.perf_counter()
    etab, ens = construire_jeu_demonstration(3, 30000, 40000)
    t_generation = round(time.perf_counter() - t, 2)
    mesures = {"generation_fictive": t_generation, "ecoles": len(etab), "enseignants": len(ens)}
    t = time.perf_counter()
    fe = _importer(drh, _xlsx(etab, "etab.xlsx"))["id"]
    fn = _importer(drh, _xlsx(ens, "ens.xlsx"), "enseignants")["id"]
    mesures["envoi_des_deux_fichiers"] = round(time.perf_counter() - t, 2)
    seul, mesures["creation_etablissements_seuls"] = _creer(drh, {"fichier_etablissements": fe}, annee_scolaire="2025-2026")
    fe2 = _importer(drh, _xlsx(etab, "etab.xlsx"))["id"]
    complet, mesures["creation_complete"] = _creer(drh, {"fichier_etablissements": fe2, "fichier_enseignants": fn},
                                                     annee_scolaire="2025-2026")
    for mode, jeu in (("seuls", seul), ("complet", complet)):
        for nom, url in (("diagnostic", "diagnostic/"), ("planification", "planification/"),
                         ("previsionnel", "planification/previsionnel/"), ("arbre", "territoires/arbre/")):
            _, mesures[f"{mode}_{nom}"] = _lire(drh, f"jeux/{jeu['id']}/{url}")
    assert seul["nb_etablissements"] == 30000 and complet["nb_enseignants"] == 40000
    _noter("performance_jeu_fictif_30000_40000", mesures)
