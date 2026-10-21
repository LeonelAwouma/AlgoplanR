"""Module IA décisionnel (Gemini). La clé n'existe que dans l'environnement serveur."""
from __future__ import annotations

import json
import os

from contextes.commun.erreurs import RefusMetier
from domaine.donnees import colonnes as C

MODELE = "gemini-2.5-flash"


def client():
    cle = os.environ.get("GEMINI_API_KEY", "")
    if not cle:
        raise RefusMetier("IA indisponible", ["Variable d'environnement GEMINI_API_KEY absente"], code="ia_indisponible")
    try:
        from google import genai
        return genai.Client(api_key=cle)
    except Exception as exc:
        raise RefusMetier("Bibliothèque IA indisponible", [str(exc)], code="ia_indisponible")


def _generer(prompt: str) -> str:
    try:
        return client().models.generate_content(model=MODELE, contents=prompt).text
    except RefusMetier:
        raise
    except Exception as exc:
        raise RefusMetier("Erreur du service IA", [str(exc)], code="ia_erreur")


def note_strategique(res: dict) -> str:
    s = res["synthese"]
    top = {}
    for l in res["ecoles_en_besoin"]:
        top[l.get(C.COL_ETAB_DEPT)] = top.get(l.get(C.COL_ETAB_DEPT), 0) + 1
    top = dict(sorted(top.items(), key=lambda x: -x[1])[:5])
    return _generer(f"""Tu es l'Expert Principal en Planification Scolaire et GRH au MINEDUB/PAREC.
Rédige une NOTE DE SYNTHÈSE STRATÉGIQUE pour Monsieur le Ministre.

DONNÉES :
- Besoin total : {s.get('besoin_total', 0)}
- Vivier : {s.get('disponibles', 0)}
- Affectés : {s.get('affectes', 0)}
- Effet de Prince : {s.get('effet_de_prince', 0)}
- Non affectés : {s.get('non_affectes', 0)}
- Postes résiduels : {s.get('a_recruter', 0)}
- R_T par sous-système : {s.get('rt_par_sous_systeme', {})}
- Top départements en tension : {top}

STRUCTURE :
1. ÉTAT DES LIEUX GLOBAL
2. ANALYSE DES DISPARITÉS TERRITORIALES
3. OBSERVATION SUR LES AFFECTATIONS DÉROGATOIRES
4. RECOMMANDATIONS OPÉRATIONNELLES

Ton administratif et direct. Markdown.""")


def audit_equite(res: dict) -> str:
    prince = [a for a in res["affectations"] if a["phase"] == "effet_de_prince"]
    if not res["affectations"]:
        return "Aucune affectation disponible."
    if not prince:
        return "Aucune dérogation « Effet de Prince » appliquée."
    resume = [{k: a.get(k) for k in ("id_ens", "nom_etab", "commune_poste", "departement_poste",
                                      "motif_derogation", "bareme")} for a in prince]
    return _generer(f"""Tu es Auditeur Général. Analyse ces {len(prince)} dérogations :
{json.dumps(resume, ensure_ascii=False, indent=2)}

LIVRABLES :
1. Concentration géographique
2. Niveau de barème des bénéficiaires
3. Impact sur l'équité perçue""")


def copilot(res: dict, question: str) -> str:
    ctx = f"Synthèse : {json.dumps(res['synthese'], ensure_ascii=False, default=str)}\nAffectations : {len(res['affectations'])}"
    return _generer(f"Tu es l'assistant IA KoSIG.\nCONTEXTE :\n{ctx}\nQUESTION : {question}")
