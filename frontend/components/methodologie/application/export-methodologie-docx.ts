'use client'

/**
 * Export Word de la page Méthodologie. Le document est produit dans le
 * navigateur à partir du même contenu que la page : une seule source de vérité.
 */

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { NOTIONS, REGLES_MOTEUR, VOCABULAIRE } from '../domain/methodologie'
import { MENTION_SIMULATION } from '../../shared/kernel'

export async function downloadMethodologyDocx(anneeScolaire?: string): Promise<void> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Méthodologie — Affectation des enseignants', heading: HeadingLevel.TITLE }),
          anneeScolaire
            ? new Paragraph({ text: `Année scolaire ${anneeScolaire}`, spacing: { after: 200 } })
            : new Paragraph({ text: '', spacing: { after: 200 } }),
          new Paragraph({
            children: [new TextRun({ text: MENTION_SIMULATION, italics: true })],
            spacing: { after: 320 },
          }),

          new Paragraph({
            text: 'Les notions, une par une',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
          }),
          ...NOTIONS.flatMap(notion => {
            const blocs = [
              new Paragraph({ text: notion.titre, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }),
              new Paragraph({ text: notion.explication, spacing: { after: 120 } }),
            ]
            if (notion.parametrable) {
              blocs.push(
                new Paragraph({
                  children: [new TextRun({ text: 'Paramétrable : ', bold: true }), new TextRun(notion.parametrable)],
                  spacing: { after: 120 },
                }),
              )
            }
            if (notion.formule) {
              blocs.push(
                new Paragraph({
                  children: [new TextRun({ text: notion.formule, font: 'Consolas', size: 20 })],
                  spacing: { after: 160 },
                }),
              )
            }
            return blocs
          }),

          new Paragraph({
            text: 'Règles exactes appliquées par le moteur',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 120 },
          }),
          ...REGLES_MOTEUR.map(
            regle =>
              new Paragraph({
                spacing: { before: 120 },
                children: [new TextRun({ text: `${regle.titre} — `, bold: true }), new TextRun(regle.texte)],
              }),
          ),

          new Paragraph({ text: 'Vocabulaire', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 120 } }),
          ...VOCABULAIRE.map(
            v =>
              new Paragraph({
                spacing: { before: 80 },
                children: [new TextRun({ text: `${v.technique} : `, bold: true }), new TextRun(v.simplifie)],
              }),
          ),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = 'methodologie-affectation-enseignants.docx'
  lien.click()
  URL.revokeObjectURL(url)
}
