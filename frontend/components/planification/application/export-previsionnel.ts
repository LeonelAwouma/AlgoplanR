'use client'

/**
 * Exports Excel et Word du tableau prévisionnel complet (base, N+1 à N+5).
 *
 * Les deux fichiers lisent les mêmes lignes que l'écran (`lignesExport`, `lignesScenarios`) : aucun chiffre n'est
 * recalculé ici. Une valeur absente reste vide (Excel) ou « Non disponible » (Word), jamais 0.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

import type { PrevisionnelComplet } from '../../shared/api'
import { MENTION_SIMULATION } from '../../shared/kernel'
import { telechargerFichier } from '../../shared/exports/export-csv'
import { exporterXLSX, type FeuilleXlsx } from '../../shared/exports/export-xlsx'
import { ENTETES_SCENARIOS, LIBELLE_NATURE, entetesExport, lignesExport, lignesScenarios } from '../domain/previsionnel'

const TYPE_MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const NON_DISPONIBLE = 'Non disponible'

/** Nom de fichier sans caractère gênant. */
const nomFichier = (p: PrevisionnelComplet, extension: string) =>
  `projection-5-ans-${p.perimetre.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.${extension}`

/** Lignes de la feuille « Minimum pédagogique » : la méthode retenue école par école, comptée. */
export function lignesMinimumPedagogique(p: PrevisionnelComplet): (string | number)[][] {
  const m = p.minimumPedagogique
  const b = p.besoinsParStatut
  return [
    ['Écoles du périmètre', p.ecoles],
    ['Groupes observés (Classes_Ouvertes ou six années sans multigrade)', m.observe],
    ['Groupes estimés à partir de Classes_Multigrades (G = 6 − M)', m.estime],
    ['Groupes de secours (Classes_Multigrades non renseigné) : besoin provisoire', m.secours],
    ['Groupes indéterminés', m.indetermine],
    ['Écoles dont le minimum pédagogique est provisoire', p.ecolesMinimumProvisoire],
    ['Écoles dont l’effectif d’élèves est inconnu', p.ecolesElevesInconnus],
    ['Postes manquants : besoin confirmé', b.confirme],
    ['Postes manquants : besoin estimé', b.estime],
    ['Postes manquants : besoin provisoire', b.provisoire],
  ]
}

/** Les feuilles du classeur : tableau complet, scénarios, hypothèses, données non disponibles, minimum pédagogique. */
export function feuillesPrevisionnel(p: PrevisionnelComplet): FeuilleXlsx[] {
  const avecDetail = p.groupes.flatMap(g => g.lignes.map(l => l.detail))
  return [
    {
      nom: 'Tableau complet',
      entetes: [...entetesExport(p), 'Définition'],
      lignes: lignesExport(p).map((l, i) => [...l, avecDetail[i] ?? '']),
    },
    { nom: 'Scénarios', entetes: ENTETES_SCENARIOS, lignes: lignesScenarios(p) },
    {
      nom: 'Hypothèses',
      entetes: ['Hypothèse', 'Valeur retenue', 'À valider administrativement'],
      lignes: p.hypotheses.map(h => [h.libelle, h.valeur, h.aValider ? 'Oui' : 'Non']),
    },
    {
      nom: 'Données non disponibles',
      entetes: ['Indicateur', 'Valeur', 'Source manquante'],
      lignes: p.nonDisponibles.map(d => [d.indicateur, NON_DISPONIBLE, d.sourceManquante]),
    },
    {
      nom: 'Minimum pédagogique',
      entetes: ['Indicateur', 'Valeur'],
      lignes: [
        ...lignesMinimumPedagogique(p),
        ...(p.messageMinimumProvisoire ? [['Avertissement', p.messageMinimumProvisoire]] : []),
      ],
    },
  ]
}

export async function exporterPrevisionnelExcel(p: PrevisionnelComplet): Promise<void> {
  await exporterXLSX(nomFichier(p, 'xlsx'), feuillesPrevisionnel(p))
}

/** Valeur d'une cellule du document Word. */
function texte(v: string | number | null): string {
  if (v === null || v === '') return NON_DISPONIBLE
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  return v
}

function cellule(valeur: string, entete: boolean, droite: boolean): TableCell {
  return new TableCell({
    shading: entete ? { fill: 'ECF5F5' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: valeur, bold: entete, size: 16 })],
      }),
    ],
  })
}

function tableau(entetes: string[], lignes: (string | number | null)[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule(e, true, i > 0)) }),
      ...lignes.map(
        l => new TableRow({ children: l.map((c, i) => cellule(texte(c), false, i > 0 && typeof c !== 'string')) }),
      ),
    ],
  })
}

const titre = (t: string) =>
  new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } })

/** Document Word : mêmes groupes, mêmes valeurs, mêmes hypothèses que l'écran. */
export function documentPrevisionnel(p: PrevisionnelComplet): Document {
  const annees = p.annees
  return new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({ text: `Projection sur 5 ans — ${p.perimetre}`, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: MENTION_SIMULATION, italics: true })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `REM de référence : ${texte(p.remReference)} élèves par enseignant. ${p.ecoles.toLocaleString('fr-FR')} écoles dans le périmètre.`,
          }),
          ...(p.messageMinimumProvisoire
            ? [
                new Paragraph({
                  spacing: { before: 120 },
                  children: [
                    new TextRun({
                      text: `${p.ecolesMinimumProvisoire.toLocaleString('fr-FR')} école(s) : `,
                      bold: true,
                    }),
                    new TextRun(p.messageMinimumProvisoire),
                  ],
                }),
              ]
            : []),
          ...p.groupes.flatMap(g => [
            titre(`${g.code}. ${g.titre}`),
            tableau(
              ['Indicateur', ...annees, 'Nature'],
              g.lignes.map(l => [l.libelle, ...l.valeurs, LIBELLE_NATURE[l.nature]]),
            ),
          ]),
          titre('Comparaison des scénarios'),
          tableau(ENTETES_SCENARIOS, lignesScenarios(p)),
          titre('Minimum pédagogique et fiabilité du besoin'),
          tableau(['Indicateur', 'Valeur'], lignesMinimumPedagogique(p)),
          titre('Données non disponibles'),
          tableau(
            ['Indicateur', 'Source manquante'],
            p.nonDisponibles.map(d => [d.indicateur, d.sourceManquante]),
          ),
          titre('Hypothèses méthodologiques'),
          tableau(
            ['Hypothèse', 'Valeur retenue', 'À valider'],
            p.hypotheses.map(h => [h.libelle, h.valeur, h.aValider ? 'Oui' : 'Non']),
          ),
        ],
      },
    ],
  })
}

export async function exporterPrevisionnelWord(p: PrevisionnelComplet): Promise<void> {
  const blob = await Packer.toBlob(documentPrevisionnel(p))
  telechargerFichier(blob, nomFichier(p, 'docx'), TYPE_MIME_DOCX)
}
