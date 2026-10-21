"""Robustesse de l'API : aucune route ne répond 5xx, même avec des paramètres ou des corps hostiles.

Parcourt toutes les routes déclarées (lecture avec des paramètres de requête hostiles, écriture avec des corps
hostiles). Une exception non gérée ou un 5xx est un défaut : une saisie invalide doit être refusée en 4xx.
"""
import json
import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver

pytestmark = pytest.mark.django_db
B = "/api/v1/"

PARAMETRES = [
    {}, {"taille": "abc"}, {"page": "-1"}, {"region": "\x00"}, {"region": "x" * 3000}, {"niveau": "xyz"},
    {"scenario": "999999"}, {"scenario": "abc"}, {"annee": "N+9"}, {"version": "abc"}, {"tri": "-inconnu"},
    {"horizon": "0"}, {"horizon": "abc"}, {"seuil_cohorte": "abc"}, {"limite": "abc"}, {"limite": "-3"},
    {"options": "abc"}, {"de": "abc", "a": "1"}, {"de": "1", "a": "99"}, {"sous_systeme": "zzz"},
]
CORPS = [
    [], None, "texte", {"nom": 123}, {"id_ens": 5, "id_etab": ["a"]}, {"motif": 5, "auteur": {"a": 1}},
    {"retenu": "abc"}, {"retenu": 10 ** 30}, {"scenario": "abc"}, {"scenario": {"a": 1}}, {"reserve": 5},
    {"parametres": "x"}, {"seuils": {"age_jeune_ans": "abc"}}, {"seuils": {"age_jeune_ans": None}},
    {"attrition": {"taux_unique": "abc"}, "motif": "m", "auteur": "a"}, {"attrition": {"methode": None}},
    {"retraite": {"age_legal": None}}, {"correspondance": "x"}, {"nb_ecoles": "abc"}, {"nb_ecoles": 0},
    {"annee_scolaire": 5}, {"annee_scolaire": "2027-2030"},
]
BRUTS = [b"{", b"[1,", b"\xff\xfe"]


def _routes(patterns, prefixe=""):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _routes(p.url_patterns, prefixe + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefixe + str(p.pattern), p.callback


def _url(route, jeu, sid, ids=None):
    valeurs = {"jeu": str(jeu), "sid": str(sid), "scenario": str(sid), **(ids or {})}
    r = re.sub(r"<(?:\w+:)?(\w+)>", lambda m: valeurs.get(m.group(1), "1"), route)
    return "/" + r.lstrip("^").rstrip("$")


def _ignoree(url):
    return not url.startswith("/api/v1/") or "/acces/" in url or "schema" in url or "docs" in url


@pytest.fixture
def jeu_et_scenario(drh):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 25, "nb_enseignants": 180}, content_type="application/json")
    jeu = r.json()["id"]
    return jeu, drh.get(B + f"jeux/{jeu}/scenarios/").json()[0]["id"]


def test_aucune_route_de_lecture_ne_repond_5xx(drh, jeu_et_scenario):
    jeu, sid = jeu_et_scenario
    urls = sorted({_url(r, jeu, sid) for r, _ in _routes(get_resolver().url_patterns)})
    erreurs = []
    for url in (u for u in urls if not _ignoree(u)):
        for q in PARAMETRES:
            try:
                rep = drh.get(url, q)
            except Exception as exc:                                # noqa: BLE001 — une exception non gérée = un 500
                erreurs.append((url, q, "EXC " + repr(exc)[:160]))
                continue
            if rep.status_code >= 500:
                erreurs.append((url, q, rep.status_code))
    assert not erreurs, "\n".join(str(e)[:260] for e in erreurs[:40])


def test_aucune_route_d_ecriture_ne_repond_5xx(drh, jeu_et_scenario):
    jeu, sid = jeu_et_scenario
    # Objets réels (nomination, mouvement) : sans eux, les routes qui les désignent répondent 404 avant tout contrôle.
    # Le scénario départemental laisse au vivier des enseignants compatibles avec des postes restés ouverts.
    dep = next(s for s in drh.get(B + f"jeux/{jeu}/scenarios/").json() if s["code"] == "geo_departement")
    drh.put(B + f"jeux/{jeu}/scenario-retenu/", json.dumps({"scenario": str(dep["id"])}),
            content_type="application/json")
    rep = drh.post(B + f"jeux/{jeu}/nominations/generer/", json.dumps({"annee": "N+1"}),
                   content_type="application/json")
    assert rep.status_code == 200, rep.content[:300]
    nominations = drh.get(B + f"jeux/{jeu}/nominations/").json()
    mouvements = drh.get(B + f"jeux/{jeu}/mouvements/").json()
    ids = {"nomination": (nominations["resultats"] if isinstance(nominations, dict) else nominations)[0]["id"],
           "mouvement": (mouvements["resultats"] if isinstance(mouvements, dict) else mouvements)[0]["id"]}
    erreurs = []
    for route, cb in sorted(_routes(get_resolver().url_patterns), key=lambda x: x[0]):
        url = _url(route, jeu, sid, ids)
        cls = getattr(cb, "cls", None)
        if _ignoree(url) or cls is None:
            continue
        for m in (x for x in ("post", "put", "patch") if hasattr(cls, x)):
            envois = [json.dumps(c) for c in CORPS] + list(BRUTS)
            for corps in envois:
                try:
                    rep = getattr(drh, m)(url, corps, content_type="application/json")
                except Exception as exc:                            # noqa: BLE001
                    erreurs.append((m, url, corps, "EXC " + repr(exc)[:160]))
                    continue
                if rep.status_code >= 500:
                    erreurs.append((m, url, corps, rep.status_code))
    assert not erreurs, "\n".join(str(e)[:260] for e in erreurs[:40])


def test_export_excel_sans_caractere_illegal_ni_formule():
    import io

    import openpyxl

    from contextes.donnees.lecteur import ecrire_excel

    contenu = ecrire_excel({"Feuille": [{"nom": "a\x00b", "formule": "=1+1", "ok": "normal"}]})
    cellules = list(openpyxl.load_workbook(io.BytesIO(contenu)).active.iter_rows(min_row=2, values_only=True))[0]
    assert cellules[0] == "ab"                 # caractère de contrôle retiré au lieu d'une erreur serveur
    assert cellules[1] == "'=1+1"              # jamais interprété comme une formule
    assert cellules[2] == "normal"
