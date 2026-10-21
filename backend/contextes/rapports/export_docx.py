"""Document Word des rapports territoriaux (lot 4, sous-lot 4.7) : titre du territoire, un tableau par
indicateur avec ses notes de bas de tableau (source, formule, population, limites), en-tête de tableau répété
sur chaque page, mise en page paysage (les tableaux portent jusqu'à 8 colonnes de situations), pied de page
numéroté. Pour l'export national complet, une section par région avec saut de page, ventilée jusqu'aux
arrondissements (sous-section par département).
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import List

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from docx.table import Table

from contextes.donnees.lecteur import _cellule_sure


def _page_paysage(document: Document) -> None:
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width


def _champ_page(paragraphe) -> None:
    """Ajoute un champ Word { PAGE } (numéro de page dynamique), un run par morceau du champ — la forme
    conventionnelle en OOXML (évite les lecteurs stricts qui refusent un champ tenu dans un seul run)."""
    def run_xml(tag: str, **attrs) -> None:
        r = paragraphe.add_run()._r
        el = r.makeelement(qn(f"w:{tag}"), {qn(f"w:{k}"): v for k, v in attrs.items()})
        r.append(el)

    def run_texte(tag: str, texte: str) -> None:
        r = paragraphe.add_run()._r
        el = r.makeelement(qn(f"w:{tag}"), {qn("xml:space"): "preserve"})
        el.text = texte
        r.append(el)

    run_xml("fldChar", fldCharType="begin")
    run_texte("instrText", " PAGE ")
    run_xml("fldChar", fldCharType="separate")
    run_xml("fldChar", fldCharType="end")


def _pied_de_page_numerote(document: Document) -> None:
    """Numéro de page au centre du pied de page (champ Word PAGE, pas une valeur figée)."""
    pied = document.sections[0].footer.paragraphs[0]
    pied.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _champ_page(pied)


def _repeter_entete(table: Table) -> None:
    """Répète la première ligne du tableau en haut de chaque page (balise tblHeader)."""
    tr_pr = table.rows[0]._tr.get_or_add_trPr()
    repeat = tr_pr.makeelement(qn("w:tblHeader"), {})
    tr_pr.append(repeat)


def _entete_bandeau(cell, texte: str) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(texte)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    cell._tc.get_or_add_tcPr().append(
        cell._tc.makeelement(qn("w:shd"), {qn("w:val"): "clear", qn("w:fill"): "1F4E79"}))


def _ajouter_tableau(document: Document, t: dict, *, niveau_titre: int = 2) -> None:
    document.add_heading(t["intitule"], level=min(niveau_titre, 9))
    entetes = ["Territoire", *t["colonnes"]]
    table = document.add_table(rows=1, cols=len(entetes))
    table.style = "Table Grid"
    for c, nom in enumerate(entetes):
        _entete_bandeau(table.rows[0].cells[c], nom)
    for ligne in t["lignes"]:
        cellules = table.add_row().cells
        cellules[0].text = str(_cellule_sure(ligne["territoire"]))
        for c, v in enumerate(ligne["valeurs"], start=1):
            v = _cellule_sure(v)
            cellules[c].text = f"{v:g}" if isinstance(v, float) else str(v)
    _repeter_entete(table)
    note = document.add_paragraph()
    note.paragraph_format.space_before = Pt(2)
    note.paragraph_format.space_after = Pt(12)
    run = note.add_run(f"Formule : {t['formule']}. Population : {t['population']}. Limites : {t['limites']}.")
    run.font.size = Pt(8)
    run.font.italic = True


def _entete_document(document: Document, titre: str, sous_titre: str) -> None:
    document.add_heading(titre, level=0)
    p = document.add_paragraph(sous_titre)
    p.runs[0].font.size = Pt(9)
    p.runs[0].font.italic = True


def _sous_titre(jeu_nom: str, scenario_id: str) -> str:
    date = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    return f"Jeu : {jeu_nom} · Scénario : {scenario_id} · Généré le {date}"


def document_perimetre(rapport: dict, tableaux: List[dict], *, jeu_nom: str = "") -> bytes:
    document = Document()
    _page_paysage(document)
    _pied_de_page_numerote(document)
    _entete_document(document, rapport["titre"], _sous_titre(jeu_nom, rapport["scenario_id"]))
    for t in tableaux:
        _ajouter_tableau(document, t)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def document_national_complet(complet: dict, *, jeu_nom: str = "", scenario_id: str = "") -> bytes:
    document = Document()
    _page_paysage(document)
    _pied_de_page_numerote(document)
    _entete_document(document, "Rapport national complet", _sous_titre(jeu_nom, scenario_id))
    for t in complet["national"]["tableaux"]:
        _ajouter_tableau(document, t, niveau_titre=2)
    for region in complet["regions"]:
        document.add_page_break()
        document.add_heading(region["titre"], level=1)
        for t in region["tableaux"]:
            _ajouter_tableau(document, t, niveau_titre=2)
        for departement in region["departements"]:
            document.add_heading(departement["titre"], level=2)
            for t in departement["tableaux"]:
                _ajouter_tableau(document, t, niveau_titre=3)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()
