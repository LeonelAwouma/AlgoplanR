"""Le domaine ne dépend ni de Django, ni de pandas, ni de numpy."""
import ast
from pathlib import Path

INTERDITS = {"django", "rest_framework", "pandas", "numpy", "openpyxl", "contextes", "algoplanr"}


def test_domaine_sans_dependance_d_infrastructure():
    racine = Path(__file__).resolve().parent.parent / "domaine"
    fautes = []
    for f in racine.rglob("*.py"):
        for n in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            mods = []
            if isinstance(n, ast.Import):
                mods = [a.name for a in n.names]
            elif isinstance(n, ast.ImportFrom) and n.level == 0 and n.module:
                mods = [n.module]
            fautes += [f"{f.name}: {m}" for m in mods if m.split(".")[0] in INTERDITS]
    assert not fautes, fautes
