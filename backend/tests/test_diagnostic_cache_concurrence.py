"""Deux requêtes simultanées calculent le même diagnostic : la seconde à écrire le cache ne doit pas échouer (500)."""
import pytest

pytestmark = pytest.mark.django_db
B = "/api/v1/"


def test_ecriture_concurrente_du_cache_du_diagnostic(drh, monkeypatch):
    from contextes.diagnostic import services
    from contextes.diagnostic.models import DiagnosticCache
    from contextes.donnees.models import JeuDeDonnees

    jeu_id = drh.post(B + "jeux/demonstration/", {"nb_ecoles": 12, "nb_enseignants": 60},
                      content_type="application/json").json()["id"]
    jeu = JeuDeDonnees.objects.get(pk=jeu_id)
    services.invalider_cache(jeu)
    reel = services.preparer

    def preparer_puis_concurrent(j, *a, **k):
        prep = reel(j, *a, **k)
        # Une autre requête a fini avant nous et écrit déjà le cache de la même empreinte.
        DiagnosticCache.objects.create(jeu=j, empreinte=services.empreinte_jeu(j), contenu={"ecoles": []})
        return prep

    monkeypatch.setattr(services, "preparer", preparer_puis_concurrent)
    ecoles = services.ecoles_enrichies(jeu)                       # ne lève pas d'IntegrityError
    assert len(ecoles) == 12
    assert DiagnosticCache.objects.filter(jeu=jeu).count() == 1
