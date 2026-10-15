/**
 * Retire de l'export statique (out/) tout ce qui ne sert qu'au développement
 * avec des données factices : le service worker de MSW et les données
 * générées par moteur-reference. L'application compilée n'en contient ainsi
 * aucune trace, même si le build est lancé sur un poste de développement.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'

const EXPORT = 'out'
const A_RETIRER = ['donnees-factices', 'mockServiceWorker.js']

for (const element of A_RETIRER) {
  rmSync(join(EXPORT, element), { recursive: true, force: true })
}
console.log(`Export nettoyé : ${A_RETIRER.join(', ')} retirés de ${EXPORT}/.`)
