"""Isolement des comptes : un délégué ne lit ni n'écrit rien sur un jeu qui n'est pas dans son périmètre.

Parcourt toutes les routes portant un identifiant de jeu : sur le jeu national du DRH, un délégué régional doit être
refusé (404, 403…) partout, jamais servi (2xx) — lecture comme écriture.
"""
import json
import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver

pytestmark = pytest.mark.django_db
B = "/api/v1/"


def _routes(patterns, prefixe=""):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _routes(p.url_patterns, prefixe + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefixe + str(p.pattern), p.callback


def _url(route, jeu, sid):
    r = re.sub(r"<(?:\w+:)?(\w+)>", lambda m: {"jeu": str(jeu), "sid": str(sid), "scenario": str(sid)}.get(
        m.group(1), "1"), route)
    return "/" + r.lstrip("^").rstrip("$")


def test_un_delegue_est_refuse_sur_le_jeu_national_du_drh(drh, centre):
    r = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 20, "nb_enseignants": 150}, content_type="application/json")
    jeu = r.json()["id"]
    sid = drh.get(B + f"jeux/{jeu}/scenarios/").json()[0]["id"]
    servies, testees = [], 0
    for route, cb in sorted(_routes(get_resolver().url_patterns), key=lambda x: x[0]):
        if not re.search(r"[:<]jeu>", route):
            continue
        url = _url(route, jeu, sid)
        cls = getattr(cb, "cls", None)
        if cls is None or not url.startswith("/api/v1/jeux/"):
            continue
        for m in ("get", "post", "put", "patch", "delete"):
            if not hasattr(cls, m):
                continue
            rep = getattr(centre, m)(url, json.dumps({}) if m != "get" else {}, content_type="application/json") \
                if m != "get" else centre.get(url)
            testees += 1
            if rep.status_code < 300:
                servies.append((m.upper(), url, rep.status_code))
    assert testees > 100, testees                       # le parcours ne doit pas être vide
    assert not servies, "\n".join(map(str, servies[:30]))
    # Le jeu du DRH est toujours là, intact.
    assert drh.get(B + f"jeux/{jeu}/").status_code == 200
