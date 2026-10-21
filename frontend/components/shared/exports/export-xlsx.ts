/**
 * Exports Excel mis en forme.
 *
 * Chaque feuille a des en-têtes en gras sur fond bleu, la première ligne figée, un filtre automatique, des
 * largeurs de colonnes d'après le contenu, des formats de nombre et des bordures fines. Le classeur est produit
 * dans le navigateur, puis remis à l'utilisateur comme les autres exports : rien ne transite par le réseau.
 *
 * `exceljs` n'est chargé qu'au clic, pour ne pas alourdir les pages.
 */

import type { Workbook } from 'exceljs'

import { telechargerFichier, type CellValue } from './export-csv'

/** Format d'affichage d'une colonne. `pourcentage` attend une part entre 0 et 1. */
export type FormatColonne = 'texte' | 'entier' | 'decimal' | 'pourcentage'

export interface FeuilleXlsx {
  nom: string
  entetes: string[]
  lignes: CellValue[][]
  /** Un format par colonne ; déduit du contenu (entier, décimal, texte) pour celles qui ne sont pas précisées. */
  formats?: (FormatColonne | undefined)[]
}

const TYPE_MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const FORMAT_EXCEL: Record<Exclude<FormatColonne, 'texte'>, string> = {
  entier: '#,##0',
  decimal: '#,##0.00',
  pourcentage: '0.0%',
}
const COULEUR_ENTETE = 'FF1F4E79'
const COULEUR_BORDURE = 'FFBFBFBF'
const LARGEUR_MIN = 8
const LARGEUR_MAX = 60
/** Excel limite le nom d'une feuille à 31 caractères et refuse `[ ] : * ? / \`. */
const LONGUEUR_MAX_NOM = 31

/** Nom de feuille valide et unique dans le classeur. */
export function nomDeFeuille(nom: string, deja: ReadonlySet<string>): string {
  const propre = nom.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Feuille'
  let candidat = propre.slice(0, LONGUEUR_MAX_NOM)
  for (let n = 2; deja.has(candidat.toLowerCase()); n++) {
    const suffixe = ` (${n})`
    candidat = propre.slice(0, LONGUEUR_MAX_NOM - suffixe.length) + suffixe
  }
  return candidat
}

/** Format d'une colonne d'après ses valeurs : entier, décimal, ou texte dès qu'une valeur n'est pas un nombre. */
export function formatDeduit(valeurs: readonly CellValue[]): FormatColonne {
  let nombre = false
  let decimal = false
  for (const v of valeurs) {
    if (v == null || v === '') continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'texte'
    nombre = true
    if (!Number.isInteger(v)) decimal = true
  }
  if (!nombre) return 'texte'
  return decimal ? 'decimal' : 'entier'
}

function valeurCellule(v: CellValue, format: FormatColonne): string | number | null {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (format !== 'texte' && typeof v === 'number' && Number.isFinite(v)) return v
  return String(v)
}

function largeur(entete: string, valeurs: readonly (string | number | null)[], format: FormatColonne): number {
  const texte = (v: string | number | null) =>
    v == null ? '' : typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : v
  const plusLong = Math.max(entete.length, ...valeurs.slice(0, 500).map(v => texte(v).length))
  const marge = format === 'texte' ? 2 : 3
  return Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, plusLong + marge))
}

/** Construit le classeur mis en forme (fonction séparée du téléchargement pour être testée). */
export async function construireClasseur(feuilles: readonly FeuilleXlsx[]): Promise<Workbook> {
  const { Workbook: ClasseurExcel } = await import('exceljs')
  const classeur = new ClasseurExcel()
  classeur.creator = 'AlgoPlanR'
  classeur.created = new Date()
  const noms = new Set<string>()

  for (const f of feuilles) {
    const nom = nomDeFeuille(f.nom, noms)
    noms.add(nom.toLowerCase())
    const feuille = classeur.addWorksheet(nom, { views: [{ state: 'frozen', ySplit: 1 }] })

    const formats = f.entetes.map((_, c) => f.formats?.[c] ?? formatDeduit(f.lignes.map(ligne => ligne[c])))
    feuille.addRow(f.entetes)
    for (const ligne of f.lignes) {
      feuille.addRow(f.entetes.map((_, c) => valeurCellule(ligne[c], formats[c])))
    }

    f.entetes.forEach((entete, c) => {
      const colonne = feuille.getColumn(c + 1)
      colonne.width = largeur(
        entete,
        f.lignes.map(ligne => valeurCellule(ligne[c], formats[c])),
        formats[c],
      )
      if (formats[c] !== 'texte') colonne.numFmt = FORMAT_EXCEL[formats[c]]
    })

    const bordure = { style: 'thin' as const, color: { argb: COULEUR_BORDURE } }
    feuille.eachRow(ligne => {
      ligne.eachCell({ includeEmpty: true }, cellule => {
        cellule.border = { top: bordure, left: bordure, bottom: bordure, right: bordure }
        if (typeof cellule.value === 'number') cellule.alignment = { horizontal: 'right' }
      })
    })
    const entete = feuille.getRow(1)
    entete.height = 22
    entete.eachCell(cellule => {
      cellule.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } }
      cellule.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cellule.numFmt = '@'
    })
    if (f.entetes.length > 0) {
      feuille.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: f.entetes.length } }
    }
  }
  return classeur
}

/** Classeur mis en forme sous forme d'octets, pour les exports qui le téléchargent plus tard. */
export async function classeurEnOctets(feuilles: readonly FeuilleXlsx[]): Promise<Uint8Array> {
  const classeur = await construireClasseur(feuilles)
  return new Uint8Array((await classeur.xlsx.writeBuffer()) as ArrayBuffer)
}

/** Génère et télécharge un classeur Excel mis en forme (une ou plusieurs feuilles). */
export async function exporterXLSX(nomFichier: string, feuilles: readonly FeuilleXlsx[]): Promise<void> {
  const classeur = await construireClasseur(feuilles)
  const octets = await classeur.xlsx.writeBuffer()
  telechargerFichier(new Uint8Array(octets as ArrayBuffer), nomFichier, TYPE_MIME_XLSX)
}

/**
 * Exporte un seul tableau, avec la même signature que `exporterCSV` (le nom du fichier en `.xlsx` donne aussi
 * le nom de la feuille).
 */
export async function exporterTableauXLSX(
  nomFichier: string,
  entetes: string[],
  lignes: CellValue[][],
  formats?: (FormatColonne | undefined)[],
): Promise<void> {
  const nom = nomFichier.replace(/\.xlsx$/i, '').replace(/-/g, ' ')
  await exporterXLSX(nomFichier, [{ nom: nom.charAt(0).toUpperCase() + nom.slice(1), entetes, lignes, formats }])
}
