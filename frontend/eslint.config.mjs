/**
 * Configuration ESLint (flat config, Next 16 : `next lint` n'existe plus).
 *
 * En plus des règles de Next et de TypeScript, ce fichier fait respecter les
 * frontières entre les modules de components/ (un module par contexte métier,
 * DDD) et entre leurs couches :
 *
 *   components/<module>/domain          types et règles d'affichage, sans React ni réseau
 *   components/<module>/infrastructure  appels HTTP, une fonction par route
 *   components/<module>/application     hooks de requête et de mutation
 *   components/<module>/ui              pages et composants, qui passent par application/
 *   components/shared                   noyau commun (API, session, interface, noyau métier)
 *   components/racine                   assemblage des modules, seul à importer leurs pages
 *
 * Les couches sans React (domain, infrastructure, shared/api, shared/kernel,
 * mocks) n'utilisent que des imports relatifs : elles sont compilées et testées
 * sous Node, où les alias ne sont pas résolus. L'interface utilise les alias
 * `@shared/*` et `@components/<module>`.
 */

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

/** Interdit tout import du moteur de référence, conservé hors du frontend pour le portage Python. */
const SANS_MOTEUR_REFERENCE = {
  group: ['**/moteur-reference/**'],
  message: 'Le frontend ne calcule rien : passez par l’API (components/*/infrastructure).',
}

/**
 * Un module n'est visible des autres que par son index public. Seule
 * exception : `@components/<module>/pages`, réservé à la racine de
 * l'application qui assemble les écrans. Le noyau commun s'importe par
 * `@shared/*`, jamais par `@components/shared/*`.
 */
const SANS_IMPORT_PROFOND = {
  group: ['@components/*/*', '@components/*/*/**', '!@components/*/pages', '@/components/*/*', '@/components/*/*/**'],
  message: 'Importez un autre module par son index public (@components/<module>) et le noyau commun par @shared/*.',
}

/** Les pages d'un module ne sont assemblées que par la racine (components/racine, app). */
const SANS_PAGES = {
  group: ['@components/*/pages', '**/components/*/pages'],
  message: 'Seule la racine de l’application (components/racine) importe les pages des modules.',
}

/** Les couches testées sous Node ne peuvent pas utiliser les alias, que Node ne résout pas. */
const SANS_ALIAS = {
  group: ['@/*', '@shared/*', '@components/*'],
  message: 'Cette couche est testée sous Node : utilisez un import relatif.',
}

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', { patterns: [SANS_MOTEUR_REFERENCE, SANS_IMPORT_PROFOND, SANS_PAGES] }],
    },
  },

  // Racine de composition : seul endroit autorisé à importer les pages des modules.
  {
    files: ['components/racine/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SANS_MOTEUR_REFERENCE, SANS_IMPORT_PROFOND] }],
    },
  },

  // Domaine : ni React, ni réseau, ni alias.
  {
    files: ['components/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react', message: 'Le domaine ne dépend pas de React.' }],
          patterns: [
            SANS_MOTEUR_REFERENCE,
            SANS_ALIAS,
            {
              group: ['**/infrastructure/**', '**/application/**', '**/ui/**'],
              message: 'Le domaine ne dépend d’aucune autre couche.',
            },
            { group: ['**/shared/api/client'], message: 'Le domaine ne fait pas d’appel réseau.' },
          ],
        },
      ],
    },
  },

  // Infrastructure, client API, noyau partagé et données factices : testés sous Node.
  {
    files: [
      'components/*/infrastructure/**/*.ts',
      'components/shared/api/**/*.ts',
      'components/shared/kernel/**/*.ts',
      'mocks/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react', message: 'Cette couche ne dépend pas de React.' }],
          patterns: [SANS_MOTEUR_REFERENCE, SANS_ALIAS],
        },
      ],
    },
  },

  // Interface : passe par les hooks de la couche application.
  {
    files: ['components/*/ui/**/*.{ts,tsx}'],
    // Les composants communs (components/shared/ui) ne forment pas un module métier.
    ignores: ['components/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            SANS_MOTEUR_REFERENCE,
            SANS_IMPORT_PROFOND,
            SANS_PAGES,
            { group: ['**/infrastructure/**'], message: 'L’interface passe par les hooks de application/.' },
          ],
        },
      ],
    },
  },

  // Doit rester en dernier : désactive les règles de style gérées par Prettier.
  prettier,

  globalIgnores(['.next/**', 'out/**', 'build/**', '.test-build/**', 'next-env.d.ts', 'public/mockServiceWorker.js']),
])
