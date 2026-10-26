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
import {
  ENTETES_AUDIT_RETRAITES,
  ENTETES_RAPPROCHEMENT,
  ENTETES_SCENARIOS,
  LIBELLE_NATURE,
  avertissementsCoherence,
  controlesAuditRetraites,
  entetesExport,
  libelleNatures,
  lignesAuditRetraites,
  lignesContexte,
  lignesExport,
  lignesFiabilite,
  lignesRapprochement,
  lignesScenarios,
  natureCase,
  phraseContexte,
  raisonsIndisponibles,
  renvoi,
  syntheseRapprochement,
} from '../domain/previsionnel'

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
    ['Groupes observés (Classes_Ouvertes, seulement si le réglage est activé)', m.observe],
    ['Groupes estimés à partir de Classes_Multigrades (G = 6 − M)', m.estime],
    ['Groupes de secours (Classes_Multigrades non renseigné) : besoin provisoire', m.secours],
    ['Groupes indéterminés', m.indetermine],
    ['Écoles dont le minimum pédagogique est provisoire', p.ecolesMinimumProvisoire],
    ['Écoles dont l’effectif d’élèves est inconnu', p.ecolesElevesInconnus],
    ['Postes manquants : besoin confirmé', b.confirme],
    ['Postes manquants : besoin estimé', b.estime],
    ['Postes manquants : besoin provisoire', b.provisoire],
    ...lignesFiabilite(p),
  ]
}

/**
 * Les feuilles du classeur : contexte, tableau complet, natures des valeurs, scénarios, audit des retraites,
 * hypothèses, données non disponibles, minimum pédagogique, avertissements.
 */
export function feuillesPrevisionnel(p: PrevisionnelComplet): FeuilleXlsx[] {
  const lignes = p.groupes.flatMap(g => g.lignes)
  // Une case vide du classeur n'est jamais muette : la raison de l'absence est dans la dernière colonne.
  const raisonsLigne = lignes.map(l => [...new Set((l.raisons ?? []).filter((r): r is string => !!r))].join(' ; '))
  return [
    {
      nom: 'Contexte',
      entetes: ['Rubrique', 'Valeur'],
      lignes: [
        ...(p.texteDonneesFictives ? [['DONNÉES FICTIVES', p.texteDonneesFictives]] : []),
        ...lignesContexte(p),
        ['Passage de la base à N+1', p.hypotheseTransition ?? ''],
        ['Avertissement', MENTION_SIMULATION],
      ],
      // Format explicite : les nombres restent des nombres, les textes des textes.
      formats: ['texte', 'entier'],
    },
    {
      nom: 'Tableau complet',
      entetes: [...entetesExport(p), 'Définition', 'Raison des valeurs non disponibles'],
      lignes: lignesExport(p).map((l, i) => [...l, lignes[i]?.detail ?? '', raisonsLigne[i] ?? '']),
    },
    {
      // Qualification de chaque case : une valeur future n'est jamais « observée ».
      nom: 'Nature des valeurs',
      entetes: ['Groupe', 'Indicateur', ...p.annees],
      lignes: p.groupes.flatMap(g =>
        g.lignes.map(l => [
          `${g.code}. ${g.titre}`,
          l.libelle,
          ...l.valeurs.map((_, i) => LIBELLE_NATURE[natureCase(l, i)]),
        ]),
      ),
    },
    { nom: 'Scénarios', entetes: ENTETES_SCENARIOS, lignes: lignesScenarios(p) },
    {
      nom: 'Synthèse rapprochement',
      entetes: ['Contrôle', 'Valeur'],
      lignes: [...syntheseRapprochement(p), ...(p.rapprochement ? [['Méthode', p.rapprochement.methode]] : [])],
      formats: ['texte', 'entier'],
    },
    {
      nom: 'Rapprochement des effectifs',
      entetes: ENTETES_RAPPROCHEMENT,
      lignes: lignesRapprochement(p),
      formats: ['texte', 'texte', ...Array<'entier'>(10).fill('entier'), 'texte'],
    },
    {
      nom: 'Audit des retraites',
      entetes: ENTETES_AUDIT_RETRAITES,
      lignes: [...lignesAuditRetraites(p), [], ...controlesAuditRetraites(p)],
      formats: ['texte', 'entier', 'entier', 'entier', 'decimal', 'decimal'],
    },
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
      lignes: lignesMinimumPedagogique(p),
      formats: ['texte', 'entier'],
    },
    {
      nom: 'Avertissements',
      entetes: ['Sujet', 'Avertissement'],
      lignes: [
        ...(p.texteDonneesFictives ? [['Données fictives', p.texteDonneesFictives]] : []),
        ...avertissementsCoherence(p).map(a => [
          `Cohérence${a.gravite === 'important' ? ' (important)' : ''}`,
          a.message,
        ]),
        ...(p.messageMinimumProvisoire ? [['Classes multigrades', p.messageMinimumProvisoire]] : []),
        ...(p.avertissementPersonnels ? [['Personnels enseignants', p.avertissementPersonnels]] : []),
        ...raisonsIndisponibles(p).map(r => [`Non disponible : ${r.cellules.join(' ; ')}`, r.raison]),
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
  const raisons = raisonsIndisponibles(p)
  return new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({ text: `Projection sur 5 ans — ${p.perimetre}`, heading: HeadingLevel.TITLE }),
          ...(p.texteDonneesFictives
            ? [
                new Paragraph({
                  spacing: { after: 200 },
                  children: [new TextRun({ text: p.texteDonneesFictives, bold: true, color: 'B42318', size: 28 })],
                }),
              ]
            : []),
          new Paragraph({
            children: [new TextRun({ text: MENTION_SIMULATION, italics: true })],
            spacing: { after: 200 },
          }),
          ...(p.contexte
            ? [
                new Paragraph({
                  spacing: { after: 120 },
                  children: [new TextRun({ text: phraseContexte(p), bold: true })],
                }),
              ]
            : []),
          new Paragraph({
            text: `REM de référence : ${texte(p.remReference)} élèves par enseignant. ${p.ecoles.toLocaleString('fr-FR')} écoles dans le périmètre.`,
          }),
          ...(p.hypotheseTransition ? [new Paragraph({ spacing: { before: 120 }, text: p.hypotheseTransition })] : []),
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
          ...(p.avertissementPersonnels
            ? [
                new Paragraph({
                  spacing: { before: 120 },
                  children: [
                    new TextRun({ text: 'Personnels enseignants : ', bold: true }),
                    new TextRun(p.avertissementPersonnels),
                  ],
                }),
              ]
            : []),
          ...(avertissementsCoherence(p).length
            ? [
                titre('Avertissements de cohérence'),
                ...avertissementsCoherence(p).map(
                  a =>
                    new Paragraph({
                      spacing: { before: 80 },
                      children: [new TextRun({ text: a.message, bold: a.gravite === 'important' })],
                    }),
                ),
              ]
            : []),
          ...p.groupes.flatMap(g => [
            titre(`${g.code}. ${g.titre}`),
            tableau(
              ['Indicateur', ...annees, 'Nature'],
              g.lignes.map(l => [
                l.libelle,
                ...l.valeurs.map((v, i) => {
                  const n = renvoi(raisons, l, i)
                  // Sans raison, une case vide est « sans objet » (la base n'a pas de départs), jamais « 0 ».
                  return n ? `${NON_DISPONIBLE} (${n})` : (v ?? '—')
                }),
                libelleNatures(p, l),
              ]),
            ),
          ]),
          ...(raisons.length
            ? [
                titre('Valeurs non disponibles'),
                ...raisons.map(
                  (r, i) =>
                    new Paragraph({
                      spacing: { before: 80 },
                      children: [
                        new TextRun({ text: `(${i + 1}) ${r.cellules.join(' ; ')}. `, bold: true }),
                        new TextRun(r.raison),
                      ],
                    }),
                ),
              ]
            : []),
          titre('Comparaison des scénarios'),
          tableau(ENTETES_SCENARIOS, lignesScenarios(p)),
          ...(p.auditRetraites
            ? [
                titre('Audit des départs à la retraite'),
                tableau(ENTETES_AUDIT_RETRAITES, lignesAuditRetraites(p)),
                new Paragraph({ text: '' }),
                tableau(['Contrôle', 'Valeur'], controlesAuditRetraites(p)),
              ]
            : []),
          ...(p.rapprochement
            ? [
                titre('Rapprochement des effectifs'),
                new Paragraph({ spacing: { after: 120 }, text: p.rapprochement.methode }),
                tableau(['Contrôle', 'Valeur'], syntheseRapprochement(p)),
                new Paragraph({ text: '' }),
                tableau(ENTETES_RAPPROCHEMENT, lignesRapprochement(p).slice(0, 100)),
                ...(p.rapprochement.ecoles.length > 100
                  ? [
                      new Paragraph({
                        text: `100 premières écoles sur ${p.rapprochement.ecoles.length.toLocaleString('fr-FR')} (anomalies d’abord) ; le classeur Excel les contient toutes.`,
                      }),
                    ]
                  : []),
              ]
            : []),
          ...(p.contexte ? [titre('Provenance et périmètre'), tableau(['Rubrique', 'Valeur'], lignesContexte(p))] : []),
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
