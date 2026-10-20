/**
 * Met les données factices (MSW, public/donnees-factices/*.json) au contrat actuel de l'API.
 *
 * Les fichiers sont des instantanés : quand le contrat évolue, ils prennent du retard et le mode démonstration affiche
 * des champs vides ou périmés. Ce script applique les évolutions suivantes, sans toucher au reste :
 *
 * - École : `nbClasses` (qui valait BMAX) → `capaciteMaitres`, `nombreClassesOuvertes: null`, `sallesRenseignees` ;
 * - diagnostic : `nbClasses` supprimé ; `priorite.rang` ajouté ;
 * - vœu examiné : `bonification` et `poidsExamen` supprimés, `ajustementsContextuels` et `composantes` ajoutés ;
 * - règles : `bonificationMotif` et `classementCandidats` (ancien modèle S = A + Z + B) supprimés.
 *
 * Idempotent : relancé, il ne change plus rien.
 *
 *   node scripts/migrer-donnees-factices.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'donnees-factices')

let modifications = 0

function migrer(noeud) {
  if (Array.isArray(noeud)) return noeud.forEach(migrer)
  if (noeud === null || typeof noeud !== 'object') return
  const cles = Object.keys(noeud)

  // Règles : champs de l'ancien modèle de classement.
  for (const cle of ['bonificationMotif', 'classementCandidats']) {
    if (cle in noeud) {
      delete noeud[cle]
      modifications++
    }
  }

  // Diagnostic d'une école : le nombre de classes ne s'y trouve plus.
  if ('school' in noeud && 'enseignantsEtat' in noeud && 'nbClasses' in noeud) {
    delete noeud.nbClasses
    modifications++
  }
  // École : BMAX n'est pas un nombre de classes ouvertes.
  else if ('nbClasses' in noeud && ('nbSallesClasse' in noeud || 'codeEcole' in noeud)) {
    noeud.capaciteMaitres = noeud.nbClasses
    noeud.nombreClassesOuvertes ??= null
    noeud.sallesRenseignees ??= true
    delete noeud.nbClasses
    modifications++
  }

  // Priorité d'une école : rang d'accueil calculé par le serveur (inconnu ici : le classement se rabat sur le poids).
  if ('pointsAccessibilite' in noeud && 'indice' in noeud && !('rang' in noeud)) {
    noeud.rang = null
    modifications++
  }

  // Vœu examiné : score d'appariement et ajustements, plus de bonification ni de poids d'examen.
  if ('rang' in noeud && 'statut' in noeud && 'code' in noeud && ('bonification' in noeud || 'poidsExamen' in noeud)) {
    delete noeud.bonification
    delete noeud.poidsExamen
    noeud.ajustementsContextuels ??= 0
    noeud.composantes ??= null
    modifications++
  }

  for (const cle of cles) migrer(noeud[cle])
}

for (const fichier of readdirSync(dossier).filter(f => f.endsWith('.json'))) {
  const chemin = join(dossier, fichier)
  const avant = modifications
  const contenu = JSON.parse(readFileSync(chemin, 'utf8'))
  migrer(contenu)
  if (modifications > avant) {
    writeFileSync(chemin, JSON.stringify(contenu))
    console.log(`${fichier} : ${modifications - avant} modification(s)`)
  }
}
console.log(modifications === 0 ? 'Déjà à jour.' : `${modifications} modification(s) au total.`)
