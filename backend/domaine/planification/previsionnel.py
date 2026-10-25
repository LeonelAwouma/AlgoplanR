"""Tableau prévisionnel complet de « Planification – Projection sur 5 ans » : base puis N+1 à N+5.

Cinq groupes d'indicateurs (rapport MINEDUB d'octobre 2026, « Analyse prévisionnelle des effectifs, des postes et de
l'attrition ») calculés sur les données importées, jamais recopiés du rapport :
  A. population scolaire : N(t+1) = N(t) × (1 + G_PRI_PCT), écoles à effectif inconnu jamais complétées ;
  B. ressources humaines : stock administratif S, retraites nominatives, autres départs, décharges de directeurs H,
     enseignants disponibles U = S − H ;
  C. besoins pédagogiques : C = ⌈N ÷ REM_REF_PRI⌉ (ratio) distinct de Σ P, Σ m, Σ D, Σ K (école par école) ;
  D. scénarios de recrutement (S-min, S-maintien, S-besoin, sous plafond), chacun avec son propre stock ;
  E. taux d'encadrement : réel à la base, de référence, projeté par scénario, écart à la référence.
Chaque ligne porte sa nature (observé, estimé, hypothèse, provisoire) ; une donnée absente vaut `None` avec la
source manquante, jamais zéro. Les tableaux, graphiques et exports de l'interface lisent tous ce résultat.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..commun.encadrement import CHIFFRES_ENCADREMENT
from ..diagnostic.indicateurs import MESSAGE_MULTIGRADES_NON_RENSEIGNES, besoin_rem
from ..donnees.annee_scolaire import _FORME
from ..donnees.modeles import Enseignant
from .parametres import ANNEES_PLAN
from .projection import SCENARIOS, ProjectionEcole
from .rapport import LIBELLES_SCENARIOS, eleves_base, raison_rems, rem_base, rems

OBSERVE, ESTIME, HYPOTHESE, PROVISOIRE, NON_DISPONIBLE = "observe", "estime", "hypothese", "provisoire", "non_disponible"


def annee_base(annee_scolaire: str) -> Optional[str]:
    """Année des effectifs de base : celle qui précède la rentrée que prépare le jeu (N+1), ou None si inconnue."""
    m = _FORME.match(str(annee_scolaire or "").strip())
    return f"{int(m.group(1)) - 1}-{int(m.group(1))}" if m else None


def libelles_annees(annee_scolaire: str, horizon: int) -> List[str]:
    """« Base (2025-2026) », puis « N+1 (2026-2027) »… : l'année scolaire du jeu est la rentrée qu'il prépare (N+1),
    la base est la situation importée, celle de l'année qui précède. Aucune année n'est codée en dur."""
    m = _FORME.match(str(annee_scolaire or "").strip())
    base = annee_base(annee_scolaire)
    out = [f"Base ({base})" if base else "Base"]
    for k in range(horizon):
        if m:
            debut = int(m.group(1)) + k
            out.append(f"{ANNEES_PLAN[k]} ({debut}-{debut + 1})")
        else:
            out.append(ANNEES_PLAN[k])
    return out


#: Avertissement sur Enseignants_Actuels : affiché par l'interface et les exports (même texte, vérifié par les tests).
AVERTISSEMENT_PERSONNELS = ("Les effectifs enseignants sont ceux des personnels rapprochés dans la cartographie "
                            "(Enseignants_Actuels). Ces personnels ne sont pas nécessairement tous des maîtres "
                            "chargés de classe : leur statut n'est pas fourni par les fichiers importés.")


def _ligne(cle: str, libelle: str, base, valeurs: List, *, nature: str = OBSERVE, decimal: bool = False,
           unite: str = "nombre", detail: str = "", raisons: Optional[List[Optional[str]]] = None) -> dict:
    """Une ligne : base puis une valeur par année. `raisons` (même longueur) dit pourquoi une valeur est absente."""
    vals = [base] + list(valeurs)
    out = {"cle": cle, "libelle": libelle, "valeurs": vals, "nature": nature, "decimal": decimal, "unite": unite,
           "detail": detail}
    if raisons is not None:
        out["raisons"] = [r if v is None else None for v, r in zip(vals, raisons)]
    return out


def _fr(x) -> str:
    """Nombre en écriture française (virgule décimale) pour les textes affichés : 74,4 ; 2,25."""
    return f"{float(x):g}".replace(".", ",")


def _ecart(rem: Optional[float], ref: float) -> Optional[float]:
    return None if rem is None else round(rem - ref, CHIFFRES_ENCADREMENT)


def _pct(n: float, total: float) -> Optional[float]:
    return round(100.0 * n / total, 1) if total else None


def resume_scenario(s: str, lignes: List[dict], ref: float) -> dict:
    """Recrutements, effectifs projetés, REM obtenu, écart à la référence et besoin restant d'un scénario."""
    r = rems(lignes)
    fin = lignes[-1] if lignes else {}
    complet = all(l.get("population_complete", True) for l in lignes)
    # Enseignants qui manquent encore pour atteindre le REM de référence à la fin de l'horizon : C − U.
    restant = (max(0, besoin_rem(fin.get("eleves_brut", 0.0), ref) - fin.get("disponibles_fin", 0))
               if lignes and complet else None)
    return {"scenario": s, "libelle": LIBELLES_SCENARIOS[s],
            "recrutements": [l["recrutement"] for l in lignes], "recrutements_total": sum(l["recrutement"] for l in lignes),
            "effectif_fin": [l.get("effectif_fin") for l in lignes],
            "disponibles_fin": [l.get("disponibles_fin") for l in lignes],
            "rem": r, "ecart_reference": [_ecart(x, ref) for x in r],
            "rem_final": r[-1] if r else None, "ecart_final": _ecart(r[-1], ref) if r else None,
            "besoin_restant_final": restant,
            "besoin_restant_raison": None if restant is not None or not lignes else
            next((l.get("rem_raison") for l in lignes if l.get("rem_raison")), None)}


def donnees_non_disponibles(ecoles: List[ProjectionEcole], enseignants: List[Enseignant]) -> List[dict]:
    """Indicateurs du rapport MINEDUB qu'aucune donnée importée ne permet de calculer : « Non disponible » et la source
    manquante, jamais une valeur inventée ni ajoutée aux totaux."""
    out = [
        {"indicateur": "Chargés de classe déclarés au SIGE", "valeur": None,
         "source_manquante": "Extraction SIGE des chargés de classe par école (non importée dans AlgoPlanR)."},
        {"indicateur": "Agents hors cartographie", "valeur": None,
         "source_manquante": "Rapprochement SIGE ↔ fichier de cartographie des personnels (non disponible)."},
        {"indicateur": "Écart de couverture SIGE − cartographie", "valeur": None,
         "source_manquante": "Les deux sources ci-dessus."},
        {"indicateur": "Qualité réelle des personnels rattachés (chargés de classe ou non)", "valeur": None,
         "source_manquante": ("Enseignants_Actuels compte les personnes rattachées à l'école ; leur qualité de maître "
                              "chargé de classe n'est pas vérifiée.")},
    ]
    sans_mg = sum(1 for e in ecoles if e.minimum_provisoire)
    if sans_mg:
        out.append({"indicateur": "Groupes pédagogiques réels (classes multigrades)", "valeur": None,
                    "source_manquante": (f"Classes_Multigrades non renseigné ou illisible pour {sans_mg} école(s) : "
                                         + MESSAGE_MULTIGRADES_NON_RENSEIGNES)})
    flux = sum(1 for e in ecoles if e.bmax_incertain)
    if flux:
        out.append({"indicateur": "Mode d'utilisation des salles (simple ou double flux)", "valeur": None,
                    "source_manquante": (f"Salles_Double_Flux non renseigné pour {flux} école(s) : le total des salles "
                                         "est compté en simple flux (BMAX approché).")})
    ids = {e.id for e in ecoles}
    rattaches = [t for t in enseignants if t.ecole_attache in ids]
    sans_age = sum(1 for t in rattaches if t.age is None)
    if sans_age:
        out.append({"indicateur": "Âge des enseignants", "valeur": None,
                    "source_manquante": f"{sans_age} enseignant(s) sans âge : leurs retraites ne sont pas comptées."})
    return out


def construire(ecoles: List[ProjectionEcole], enseignants: List[Enseignant], traj: Dict[str, List[dict]],
               suivi: List[dict], hyp: dict, *, annee_scolaire: str = "") -> dict:
    """Tableau complet. `traj` : lignes de chaque scénario (calculer_annees sur le périmètre) ; `suivi` : lignes de la
    trajectoire sous plafond après report des décisions (quotas retenus) — celles du tableau principal."""
    drh = hyp["drh"]
    ref = float(drh["REM_REF_PRI"])
    horizon = len(suivi)
    nb = len(ecoles)
    inconnues = sum(1 for e in ecoles if not e.eleves_connus)
    provisoires = sum(1 for e in ecoles if e.minimum_provisoire)
    # Minimum provisoire ≠ besoin final incertain : un minimum de secours est sans effet quand l'effectif d'élèves ou
    # les salles fixent le besoin de l'école.
    besoin_provisoire = sum(1 for e in ecoles if e.statut_besoin == "provisoire")
    besoin_estime = sum(1 for e in ecoles if e.statut_besoin == "estime")
    sans_effet = sum(1 for e in ecoles if e.minimum_provisoire and e.statut_besoin == "confirme")
    base_eleves = eleves_base(ecoles)
    stock = sum(e.effectif_initial for e in ecoles)
    nature_besoin = PROVISOIRE if besoin_provisoire else ESTIME
    rem0 = rem_base(ecoles)
    raison_base = None if rem0 is not None else "Aucune école du périmètre n'a d'effectif d'élèves connu."

    a = [
        _ligne("eleves", "Effectifs d'élèves (écoles à effectif connu)", round(base_eleves),
               [round(l["eleves"]) for l in suivi], nature=OBSERVE,
               detail="Base : effectifs importés ; années suivantes : projection N(t+1) = N(t) × (1 + croissance), "
                      "arrondie à l'unité à l'affichage seulement."),
        _ligne("croissance", "Taux de croissance annuel des élèves", None, [drh["G_PRI_PCT"]] * horizon,
               nature=HYPOTHESE, decimal=True, unite="pourcentage",
               detail="Hypothèse G_PRI_PCT (2,7 % par défaut), appliquée à chaque école dont l'effectif est connu."),
        _ligne("ecoles_eleves_inconnus", "Écoles dont l'effectif d'élèves est inconnu", inconnues,
               [inconnues] * horizon, nature=OBSERVE,
               detail="Aucun effectif n'est inventé pour ces écoles : elles ne comptent ni dans les élèves projetés "
                      "ni dans le taux d'encadrement."),
    ]
    b = [
        _ligne("effectif_debut", "Personnels enseignants en début d'année (stock administratif)", stock,
               [l["effectif_debut"] for l in suivi], nature=OBSERVE,
               detail="Enseignants_Actuels (personnels rapprochés dans la cartographie, pas nécessairement tous "
                      "chargés de classe) après les mouvements du scénario retenu ; dès N+2, recrutements de "
                      "l'année précédente (quota retenu ou calculé) inclus."),
        _ligne("departs_retraite", "Départs à la retraite", None, [l["departs_retraite"] for l in suivi],
               nature=OBSERVE, detail="Comptés nominativement d'après l'âge (jamais par le taux de 1,08 %)."),
        _ligne("departs_attrition", "Autres départs par attrition (hors retraite)", None,
               [l["departs_attrition"] for l in suivi], nature=HYPOTHESE,
               detail=f"Taux d'autres départs ({_fr(suivi[0]['taux_attrition'] if suivi else drh['A_AUT_PRI_PCT'])} %) "
                      "× stock de début : l'attrition totale (3,33 %) n'est pas ajoutée aux retraites."),
        _ligne("directeurs_decharges", "Directeurs déchargés de classe (nouveaux)", None,
               [l["directeurs_decharges"] for l in suivi], nature=HYPOTHESE,
               detail="Prises de fonction de l'année sans classe (DIR_NOM_AN × DIR_H_PRI_PCT, rapportés au périmètre)."),
        _ligne("decharges_cumulees", "Décharges cumulées depuis la base", 0, [l["decharges_cumulees"] for l in suivi],
               nature=HYPOTHESE, detail="Un directeur déchargé reste dans le stock ; il n'est retranché qu'une fois "
                                        "des enseignants disponibles."),
        _ligne("effectif_fin", "Enseignants en fin d'année (stock administratif)", None,
               [l["effectif_fin"] for l in suivi], nature=ESTIME,
               detail="S(t+1) = S(t) − retraites − autres départs + recrutements."),
        _ligne("disponibles_fin", "Enseignants disponibles pour tenir une classe (fin d'année)", stock,
               [l["disponibles_fin"] for l in suivi], nature=ESTIME, detail="U = S − décharges cumulées."),
    ]
    c = [
        _ligne("besoin_rem", "Enseignants nécessaires selon le REM de référence", besoin_rem(base_eleves, ref),
               [l["besoin_rem"] for l in suivi], nature=ESTIME,
               detail=f"⌈élèves ÷ {_fr(ref)}⌉ : estimation par ratio, distincte de la somme des besoins des écoles."),
        _ligne("somme_pe", "Besoin pédagogique lié aux élèves (Σ P)", sum(e.pe_initial for e in ecoles),
               [l["somme_pe"] for l in suivi], nature=ESTIME,
               detail=f"P = max(1 ; ⌈(N − tolérance) ÷ {_fr(ref)}⌉), école par école."),
        _ligne("somme_me", "Minimum pédagogique (Σ m)", sum(e.me_initial for e in ecoles),
               [l["somme_me"] for l in suivi], nature=nature_besoin,
               detail="m = max(plancher ; G) ; G de secours (6) quand Classes_Multigrades n'est pas renseigné."),
        _ligne("somme_de", "Dotation théorique (Σ D)", sum(e.de_initial for e in ecoles),
               [l["somme_de"] for l in suivi], nature=nature_besoin, detail="D = max(P ; m)."),
        _ligne("somme_ke", "Cible réalisable (Σ K)", sum(e.cible_initial for e in ecoles),
               [l["somme_ke"] for l in suivi], nature=nature_besoin, detail="K = min(D ; BMAX)."),
        _ligne("besoin_non_couvert", "Besoin non couvert (Σ b)", sum(e.deficit_initial for e in ecoles),
               [l["besoin_non_couvert"] for l in suivi], nature=nature_besoin,
               detail="b = max(0 ; K − enseignants restants après les retraites), école par école."),
        _ligne("ressources_vivier", "Ressources mobilisables (vivier)", None, [l["ressources_vivier"] for l in suivi],
               nature=ESTIME, detail="Excédents sûrs des écoles et personnes du vivier retenues (N+1)."),
        _ligne("part_provisoire", "Part des écoles au minimum pédagogique provisoire", _pct(provisoires, nb),
               [_pct(provisoires, nb)] * horizon, nature=OBSERVE, decimal=True, unite="pourcentage",
               detail=MESSAGE_MULTIGRADES_NON_RENSEIGNES if provisoires else "Toutes les écoles renseignent leurs "
                                                                            "groupes pédagogiques."),
        _ligne("part_besoin_incertain", "Part des écoles au besoin final incertain (provisoire ou estimé)",
               _pct(besoin_provisoire + besoin_estime, nb), [_pct(besoin_provisoire + besoin_estime, nb)] * horizon,
               nature=OBSERVE, decimal=True, unite="pourcentage",
               detail="Écoles dont le besoin ou l'excédent change selon l'organisation pédagogique plausible, ou dont "
                      "l'effectif d'élèves est inconnu. Une école au minimum provisoire dont le besoin est fixé par "
                      "les élèves ou les salles n'y figure pas."),
    ]
    d = [_ligne(f"recrutement_{s}", f"Recrutement {LIBELLES_SCENARIOS[s]}", None,
                [l["recrutement"] for l in traj[s][:horizon]], nature=ESTIME) for s in SCENARIOS]
    d += [
        _ligne("quota_avant_plafond", "Recrutement avant plafond (besoin et rattrapage − vivier)", None,
               [l["quota_avant_plafond"] for l in traj["plafond"][:horizon]], nature=ESTIME),
        _ligne("quota_calcule", "Quota calculé", None, [l["quota_calcule"] for l in suivi], nature=ESTIME),
        _ligne("quota_retenu", "Quota retenu", None, [l["quota_retenu"] for l in suivi], nature=OBSERVE,
               detail="Décision administrative (page « Quotas ») ; vide tant qu'elle n'est pas prise."),
    ]
    resumes = {s: resume_scenario(s, traj[s][:horizon], ref) for s in SCENARIOS}
    e = [
        _ligne("rem_reel", "REM réel (élèves par enseignant disponible)", rem0, [l.get("rem") for l in suivi],
               nature=OBSERVE, decimal=True,
               detail="Base : écoles à effectif connu ; années : trajectoire du tableau, au début de l'année.",
               raisons=[raison_base] + [l.get("rem_raison") for l in suivi]),
        _ligne("rem_reference", "REM de référence", ref, [ref] * horizon, nature=HYPOTHESE, decimal=True),
    ]
    for s in ("min", "maintien", "besoin", "plafond"):
        r = raison_rems(traj[s][:horizon]) or "Taux non calculable pour cette année."
        e.append(_ligne(f"rem_{s}", f"REM projeté – {LIBELLES_SCENARIOS[s]}", rem0, resumes[s]["rem"], nature=ESTIME,
                        decimal=True, detail="Élèves de l'année ÷ enseignants disponibles après départs et recrutements.",
                        raisons=[raison_base] + [r] * horizon))
    r = raison_rems(traj["plafond"][:horizon]) or "Taux non calculable pour cette année."
    e.append(_ligne("ecart_reference", "Écart au REM de référence (sous plafond)", _ecart(rem0, ref),
                    resumes["plafond"]["ecart_reference"], nature=ESTIME, decimal=True,
                    detail="REM projeté sous plafond − REM de référence (positif : plus d'élèves par enseignant).",
                    raisons=[raison_base] + [r] * horizon))

    groupes = [
        {"code": "A", "titre": "Population scolaire", "lignes": a},
        {"code": "B", "titre": "Ressources humaines", "lignes": b},
        {"code": "C", "titre": "Besoins pédagogiques", "lignes": c},
        {"code": "D", "titre": "Scénarios de recrutement", "lignes": d},
        {"code": "E", "titre": "Taux d'encadrement", "lignes": e},
    ]
    return {
        "annees": libelles_annees(annee_scolaire, horizon), "annee_scolaire_plan": annee_scolaire or None,
        "groupes": groupes, "scenarios": [resumes[s] for s in SCENARIOS], "rem_reference": ref,
        "rem_indisponible": next((l["rem_raison"] for l in suivi if l.get("rem_raison")), None),
        "annee_base": annee_base(annee_scolaire),
        "avertissement_personnels": AVERTISSEMENT_PERSONNELS,
        "ecoles": nb, "ecoles_minimum_provisoire": provisoires, "ecoles_eleves_inconnus": inconnues,
        "fiabilite": {"minimum_provisoire": provisoires, "minimum_provisoire_sans_effet": sans_effet,
                      "besoin_provisoire": besoin_provisoire, "besoin_estime": besoin_estime,
                      "besoin_confirme": nb - besoin_provisoire - besoin_estime},
        "message_minimum_provisoire": MESSAGE_MULTIGRADES_NON_RENSEIGNES if provisoires else None,
        "minimum_pedagogique": {
            "observe": sum(1 for x in ecoles if x.provenance_groupes == "observe"),
            "estime": sum(1 for x in ecoles if x.provenance_groupes == "estime"),
            "secours": sum(1 for x in ecoles if x.provenance_groupes == "secours"),
            "indetermine": sum(1 for x in ecoles if x.provenance_groupes == "indetermine"),
        },
        "besoins_par_statut": {st: sum(x.deficit_initial for x in ecoles if x.statut_besoin == st)
                               for st in ("confirme", "estime", "provisoire")},
        "non_disponibles": donnees_non_disponibles(ecoles, enseignants),
        "hypotheses": hypotheses_methodologiques(hyp),
    }


def hypotheses_methodologiques(hyp: dict, besoin: Optional[dict] = None, annee_scolaire: str = "") -> List[dict]:
    """Hypothèses du calcul, avec leur valeur : reprises par l'interface (vue Analyste) et les exports."""
    from ..parametrage.config import DEFAULT_CONFIG, NORME_HISTORIQUE
    d = hyp["drh"]
    b = {**DEFAULT_CONFIG["besoin"], **(besoin or {})}
    return [
        {"code": "rem_reference", "libelle": "REM de référence (rapport MINEDUB d'octobre 2026)",
         "valeur": f"{_fr(d['REM_REF_PRI'])} élèves par enseignant", "a_valider": False},
        {"code": "norme_historique", "libelle": "Norme historique d'AlgoPlanR (avant octobre 2026)",
         "valeur": f"{NORME_HISTORIQUE} élèves par maître", "a_valider": False},
        {"code": "tolerance", "libelle": "Tolérance pédagogique AlgoPlanR",
         "valeur": f"{_fr(b['effectif_premiere_section'])} élèves", "a_valider": False},
        {"code": "plancher", "libelle": "Plancher du minimum pédagogique",
         "valeur": f"{b['plancher_pedagogique']} enseignants", "a_valider": True},
        {"code": "groupes_secours", "libelle": "Groupes de secours si Classes_Multigrades est absent",
         "valeur": f"{b['groupes_secours']} groupes (école complète de six années supposée)", "a_valider": True},
        {"code": "regroupement", "libelle": "Années réunies par classe multigrade (estimation G = 6 − M)",
         "valeur": f"{b['niveaux_par_maitre_multigrade']} années, sans chevauchement", "a_valider": True},
        {"code": "croissance", "libelle": "Croissance annuelle des élèves", "valeur": f"{_fr(d['G_PRI_PCT'])} %",
         "a_valider": False},
        {"code": "attrition", "libelle": "Attrition totale / dont retraites / autres départs",
         "valeur": f"{_fr(d['A_TOT_PRI_PCT'])} % / {_fr(d['R_PRI_PCT'])} % / {_fr(d['A_AUT_PRI_PCT'])} %", "a_valider": False},
        {"code": "directeurs", "libelle": "Directeurs déchargés de classe",
         "valeur": f"{d['DIR_NOM_AN']} prises de fonction par an, dont {_fr(d['DIR_H_PRI_PCT'])} % sans classe",
         "a_valider": True},
        {"code": "plafond", "libelle": "Plafond annuel de recrutement (primaire national)",
         "valeur": f"{d['PLAF_PRI']} ; rattrapage sur {d['ETAL_N']} an(s)", "a_valider": False},
        {"code": "salles", "libelle": "Salles sans mode de flux connu",
         "valeur": "comptées en simple flux (BMAX approché)", "a_valider": True},
        {"code": "classes_ouvertes", "libelle": "Classes_Ouvertes lu comme le nombre de groupes-classes",
         "valeur": ("oui" if b["groupes_depuis_classes_ouvertes"] else
                    "non (désactivé tant que la définition de la colonne n'est pas validée)"), "a_valider": True},
        {"code": "excedent_estime", "libelle": "Excédent reposant sur des groupes estimés ou de secours",
         "valeur": ("mobilisable" if b["mobiliser_excedent_incertain"] else
                    "soumis à validation administrative (aucune sortie automatique)"), "a_valider": True},
        {"code": "personnels", "libelle": "Enseignants_Actuels compté comme maîtres chargés de classe",
         "valeur": "personnels rapprochés dans la cartographie, statut non vérifié", "a_valider": True},
        {"code": "annee_base", "libelle": "Année des effectifs de base",
         "valeur": (f"{annee_base(annee_scolaire)} (année qui précède la rentrée {annee_scolaire} du jeu)"
                    if annee_base(annee_scolaire) else "non précisée"), "a_valider": True},
    ]
