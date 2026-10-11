/**
 * Lance `next dev` avec les données factices (NEXT_PUBLIC_API_MOCK=1), sur
 * tous les systèmes : la syntaxe `VAR=1 commande` ne fonctionne pas sous
 * Windows. Les données doivent avoir été générées au préalable :
 *
 *   pnpm --dir ../moteur-reference fixtures
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('public/donnees-factices/index.json')) {
  console.error(
    'Données factices absentes : lancez d’abord « pnpm --dir moteur-reference fixtures » à la racine du dépôt.',
  )
  process.exit(1)
}

const enfant = spawn('next', ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_MOCK: '1' },
})
enfant.on('exit', code => process.exit(code ?? 0))
