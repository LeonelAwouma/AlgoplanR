/**
 * Exports CSV et téléchargements locaux.
 *
 * Tous les fichiers sont produits dans le navigateur à partir des données déjà
 * en mémoire, puis remis à l'utilisateur via un lien objet : rien ne transite
 * par le réseau.
 */

export type CellValue = string | number | boolean | null | undefined

/** Déclenche le téléchargement local d'un contenu binaire ou textuel. */
export function telechargerFichier(contenu: BlobPart, nomFichier: string, typeMime: string): void {
  const blob = new Blob([contenu], { type: typeMime })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier
  lien.rel = 'noopener'
  document.body.appendChild(lien)
  lien.click()
  document.body.removeChild(lien)
  URL.revokeObjectURL(url)
}

function echapper(v: CellValue): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? v.toString().replace('.', ',') : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Sérialise un tableau en CSV français (séparateur « ; », BOM UTF-8). */
export function versCSV(entetes: string[], lignes: CellValue[][]): string {
  return [entetes, ...lignes].map(ligne => ligne.map(echapper).join(';')).join('\r\n')
}

/** Génère et télécharge un fichier CSV lisible directement par Excel en français. */
export function exporterCSV(nomFichier: string, entetes: string[], lignes: CellValue[][]): void {
  telechargerFichier('﻿' + versCSV(entetes, lignes), nomFichier, 'text/csv;charset=utf-8;')
}

/** Exporte un objet JSON (configuration, scénario) en fichier local. */
export function exporterJSON(nomFichier: string, donnees: unknown): void {
  telechargerFichier(JSON.stringify(donnees, null, 2), nomFichier, 'application/json')
}
