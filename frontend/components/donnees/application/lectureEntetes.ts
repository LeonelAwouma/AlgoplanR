/**
 * Lecture locale des en-têtes d'un classeur, pour savoir dans quel compartiment
 * le ranger avant de l'envoyer au serveur. Seule la première ligne de la
 * première feuille est décodée : la lecture reste rapide sur un gros fichier.
 */

/** En-têtes de la première feuille d'un classeur (.xlsx, .xls, .xlsm ou .csv). */
export async function lireEntetes(fichier: Blob): Promise<string[]> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array', sheetRows: 1 })
  const feuille = classeur.Sheets[classeur.SheetNames[0]]
  if (!feuille) return []
  const [premiere] = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, blankrows: false })
  return (premiere ?? []).map(v => String(v ?? '').trim()).filter(Boolean)
}
