"""La recherche avec bornes de difflib rend exactement le résultat du calcul complet."""
import difflib
import random

from domaine.commun.texte import cle_recherche
from domaine.donnees.recherche import rapprocher


def _reference(q, items, champs, limite=10):
    """Rapprochement d'origine : ratio complet de difflib pour chaque champ."""
    k = cle_recherche(q)
    notes = []
    for it in items:
        meilleur = 0.0
        for c in champs(it):
            ck = cle_recherche(c)
            if not ck:
                continue
            if ck == k:
                s = 1.0
            elif ck.startswith(k):
                s = 0.95
            elif k in ck:
                s = 0.85
            else:
                s = difflib.SequenceMatcher(None, k, ck).ratio() * 0.8
            meilleur = max(meilleur, s)
        if meilleur >= 0.6:
            notes.append((meilleur, it))
    notes.sort(key=lambda x: -x[0])
    return [{**it, "pertinence": round(s, 3)} for s, it in notes[:limite]]


def test_recherche_identique_au_calcul_complet():
    rnd = random.Random(5)
    syllabes = ["mba", "rga", "njo", "ya", "é", "ka", "ni", "fou", "da", "bel", "lo", "ngo"]
    mot = lambda: "".join(rnd.choice(syllabes) for _ in range(rnd.randint(1, 4)))
    items = [{"id": f"MAT-{i:05d}", "nom": mot().upper(), "prenom": mot().capitalize()} for i in range(1500)]
    champs = lambda d: [d["id"], d["nom"], d["prenom"], f"{d['nom']} {d['prenom']}"]
    cles = [[cle_recherche(c) for c in champs(d)] for d in items]
    for q in ["mbarga", "NJOYA", "fouda", "MAT-0012", "Ékani", "ngo bel", "zzz", "ya"] + [mot() for _ in range(30)]:
        attendu = _reference(q, items, champs)
        assert rapprocher(q, items, champs) == attendu, q
        assert rapprocher(q, items, cles=cles) == attendu, q
