"""Charge nationale : 30 000 écoles et 40 000 enseignants. Le diagnostic du référentiel 2026 et le tableau
prévisionnel complet (quatre scénarios sur cinq ans) restent calculables dans un temps raisonnable, au niveau du
domaine (sans base de données). Les bornes sont larges : elles détectent une explosion, pas un écart de machine."""
import random
import time

from domaine.diagnostic.indicateurs import enrichir_ecoles
from domaine.donnees import colonnes as C
from domaine.donnees.modeles import construire_ecole, construire_enseignant
from domaine.parametrage.config import defaut
from domaine.planification import previsionnel as prev
from domaine.planification.parametres import hypotheses_par_defaut
from domaine.planification.projection import calculer_annees, projeter_ecoles
from domaine.planification.suivi import appliquer_suivi

NB_ECOLES = 30_000
NB_ENSEIGNANTS = 40_000
SCENARIOS = ("min", "maintien", "besoin", "plafond")


def _bases():
    r = random.Random(2026)
    regions = ["Centre", "Littoral", "Ouest", "Nord", "Extrême-Nord", "Adamaoua", "Est", "Sud", "Nord-Ouest",
               "Sud-Ouest"]
    ecoles = []
    for i in range(NB_ECOLES):
        reg = regions[i % len(regions)]
        ecoles.append(construire_ecole({
            C.COL_ETAB_ID: f"E{i}", C.COL_ETAB_REGION: reg, C.COL_ETAB_DEPT: f"{reg}-{i % 7}",
            C.COL_ETAB_COMMUNE: "", C.COL_ETAB_IAEB: f"I{i % 300}",
            C.COL_ETAB_SS: "Anglophone" if reg in ("Nord-Ouest", "Sud-Ouest") else "Francophone",
            # Un dixième d'effectifs inconnus et un tiers de multigrades non renseignées : le cas de la base réelle.
            C.COL_ETAB_NE: None if i % 10 == 0 else r.randint(20, 900),
            C.COL_ETAB_EE: r.randint(0, 12), C.COL_ETAB_SSF: r.randint(0, 10),
            C.COL_ETAB_MULTIGRADE: None if i % 3 == 0 else r.randint(0, 3),
            C.COL_ETAB_ALPHA: r.choice(["Urbain", "Rural", "Difficile"]),
            C.COL_ETAB_SIGMA: r.choice(["Verte", "Jaune", "Rouge"]),
        }))
    enseignants = [construire_enseignant({
        C.COL_ENS_ID: f"M{j}", C.COL_ENS_ETAB: f"E{r.randrange(NB_ECOLES)}", C.COL_ENS_AGE: r.randint(22, 60),
    }) for j in range(NB_ENSEIGNANTS)]
    return ecoles, enseignants


def test_diagnostic_et_prevision_nationale_en_temps_raisonnable():
    ecoles, enseignants = _bases()
    cfg = defaut()
    hyp = hypotheses_par_defaut(cfg)

    t0 = time.perf_counter()
    enrichies = enrichir_ecoles(ecoles, cfg)
    t_diag = time.perf_counter() - t0
    assert len(enrichies) == NB_ECOLES
    assert sum(1 for e in enrichies if e.ind.minimum_provisoire) == NB_ECOLES // 3

    t0 = time.perf_counter()
    proj, _ = projeter_ecoles(ecoles, enseignants, cfg, hyp)
    traj = {s: calculer_annees(proj, hyp, scenario=s) for s in SCENARIOS}
    suivi = appliquer_suivi(calculer_annees(proj, hyp), {}, quotas=[], nominations=[], mouvements=[],
                            recrutements_supposes=bool(hyp["quotas"]["annees_precedentes_realisees"]))
    p = prev.construire(proj, enseignants, traj, suivi, hyp, annee_scolaire="2026-2027")
    t_prev = time.perf_counter() - t0

    assert p["ecoles"] == NB_ECOLES and p["ecoles_minimum_provisoire"] == NB_ECOLES // 3
    assert [g["code"] for g in p["groupes"]] == ["A", "B", "C", "D", "E"]
    assert t_diag < 60, f"diagnostic : {t_diag:.1f} s"
    assert t_prev < 240, f"prévisionnel : {t_prev:.1f} s"
    print(f"\ndiagnostic {t_diag:.1f} s ; prévisionnel (projection, 4 scénarios, tableau) {t_prev:.1f} s")
