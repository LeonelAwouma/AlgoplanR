'use client'

/**
 * Export Word du rapport décisionnel.
 *
 * Le document est construit à partir du même objet `DecisionReport` que la page
 * affiche : une seule source de vérité, donc aucun écart possible entre ce qui
 * est lu à l'écran et ce qui est transmis. Tout est produit dans le navigateur ;
 * aucun fichier ne transite par le réseau.
 */

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { DecisionReport, DecisionReportSection } from '../../../shared/api'
import { MENTION_SIMULATION } from '../../../shared/kernel'

/** Teal de l'identité visuelle, repris du logo. */
const TEAL = '027174'
const GRIS = '465668'

/** Une cellule de tableau ; l'en-tête est grisé et en gras. */
function cellule(
  texte: string,
  entete = false,
  alignement: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
): TableCell {
  return new TableCell({
    shading: entete ? { fill: 'ECF5F5' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: alignement,
        children: [new TextRun({ text: texte, bold: entete, size: 18, color: entete ? '1F2D3D' : GRIS })],
      }),
    ],
  })
}

/** Les colonnes numériques sont alignées à droite, comme à l'écran. */
function estNumerique(valeur: string | number): boolean {
  if (typeof valeur === 'number') return true
  return /^[\d\s  .,%+−-]+$/.test(valeur.trim()) && /\d/.test(valeur)
}

function tableau(entetes: string[], lignes: (string | number)[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: entetes.map((e, i) => cellule(e, true, i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT)),
      }),
      ...lignes.map(
        ligne =>
          new TableRow({
            children: ligne.map((c, i) =>
              cellule(String(c), false, i > 0 && estNumerique(c) ? AlignmentType.RIGHT : AlignmentType.LEFT),
            ),
          }),
      ),
    ],
  })
}

function sectionEnParagraphes(section: DecisionReportSection): (Paragraph | Table)[] {
  const blocs: (Paragraph | Table)[] = [
    new Paragraph({
      text: section.titre,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 140 },
    }),
  ]
  for (const p of section.paragraphes) {
    blocs.push(new Paragraph({ children: [new TextRun({ text: p, size: 22 })], spacing: { after: 120 } }))
  }
  if (section.tableau) {
    blocs.push(tableau(section.tableau.entetes, section.tableau.lignes))
    blocs.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  }
  for (const point of section.points ?? []) {
    blocs.push(new Paragraph({ text: point, bullet: { level: 0 }, spacing: { after: 60 } }))
  }
  return blocs
}

/** Charge un logo pour l'insérer dans la page de garde ; `null` s'il est indisponible. */
async function chargerLogo(chemin: string): Promise<ArrayBuffer | null> {
  try {
    const reponse = await fetch(chemin)
    if (!reponse.ok) return null
    return await reponse.arrayBuffer()
  } catch {
    return null
  }
}

export interface DocxExportInput {
  rapport: DecisionReport
  /** Nom du scénario affiché, ou situation actuelle. */
  scenarioNom: string
  /** Mention à porter en tête quand les données sont fictives. */
  donneesDemonstration: boolean
}

/** Construit le document Word et renvoie ses octets. */
export async function construireRapportDocx(input: DocxExportInput): Promise<Blob> {
  const { rapport, scenarioNom, donneesDemonstration } = input
  const logo = await chargerLogo('/logo-full.png')

  const garde: (Paragraph | Table)[] = []
  if (logo) {
    garde.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        children: [
          new ImageRun({
            data: logo,
            type: 'png',
            transformation: { width: 128, height: 85 },
            altText: { name: 'AlgoPlanR', description: 'Logo AlgoPlanR' },
          }),
        ],
      }),
    )
  }
  garde.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: 'RAPPORT D’AFFECTATION DES ENSEIGNANTS', bold: true, size: 18, color: TEAL })],
    }),
    new Paragraph({ text: rapport.perimetre, heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: 'Analyse des besoins, répartition territoriale et simulation de scénarios d’affectation',
          size: 22,
          color: GRIS,
        }),
      ],
    }),
  )

  garde.push(
    tableau(
      ['Territoire', 'Année scolaire', 'Scénario', 'Établi le'],
      [[rapport.perimetre, rapport.anneeScolaire, scenarioNom, new Date(rapport.genereLe).toLocaleString('fr-FR')]],
    ),
    new Paragraph({ text: '', spacing: { after: 200 } }),
  )

  if (donneesDemonstration) {
    garde.push(
      new Paragraph({
        spacing: { after: 160 },
        shading: { fill: 'FDF4E3' },
        children: [
          new TextRun({
            text: 'Données de démonstration : les valeurs de ce document sont fictives et ne constituent pas des statistiques officielles.',
            bold: true,
            size: 20,
            color: '6F4A0F',
          }),
        ],
      }),
    )
  }

  garde.push(
    new Paragraph({
      spacing: { after: 240 },
      shading: { fill: 'E6F3F3' },
      children: [new TextRun({ text: MENTION_SIMULATION, italics: true, size: 20, color: '0B4A4D' })],
    }),
  )

  const doc = new Document({
    creator: 'AlgoPlanR',
    title: `Rapport d’affectation des enseignants — ${rapport.perimetre}`,
    description: 'Rapport décisionnel produit localement par AlgoPlanR.',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '1F2D3D' } },
        title: { run: { font: 'Calibri', size: 52, bold: true, color: '1F2D3D' } },
        heading1: {
          run: { font: 'Calibri', size: 26, bold: true, color: TEAL },
          paragraph: { spacing: { before: 360, after: 140 } },
        },
        heading2: { run: { font: 'Calibri', size: 24, bold: true, color: '1F2D3D' } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'AlgoPlanR — document produit localement · page ', size: 16, color: GRIS }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS }),
                  new TextRun({ text: ' / ', size: 16, color: GRIS }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRIS }),
                ],
              }),
            ],
          }),
        },
        children: [...garde, ...rapport.sections.flatMap(sectionEnParagraphes)],
      },
    ],
  })

  return Packer.toBlob(doc)
}
