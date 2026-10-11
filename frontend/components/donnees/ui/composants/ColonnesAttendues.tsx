'use client'

/**
 * Aide à la préparation d'un fichier : les colonnes que le serveur cherche, les
 * indispensables d'abord. La liste vient du dictionnaire qui sert à reconnaître
 * les colonnes : elle ne peut donc pas s'en écarter.
 */

import type { ColonneAttendue, TypeFichier } from '@shared/api'

import { useColonnesAttendues } from '../../application/hooks'

/** Liste d'un groupe de colonnes (indispensables ou facultatives). */
function ListeColonnes({ colonnes }: { colonnes: ColonneAttendue[] }) {
  return (
    <ul>
      {colonnes.map(c => (
        <li key={c.champ}>
          <span>
            <b>{c.label}</b> <code className="mono">{c.alias[0] ?? c.champ}</code>
          </span>
          <small>{c.consequence}</small>
        </li>
      ))}
    </ul>
  )
}

/** Volet dépliable des colonnes attendues pour un type de classeur. */
export function ColonnesAttendues({ type }: { type: TypeFichier }) {
  const { data: colonnes } = useColonnesAttendues(type)
  // Aide facultative : tant que la liste n'est pas arrivée, rien n'est affiché.
  if (!colonnes) return null

  const indispensables = colonnes.filter(c => c.requis)
  const facultatives = colonnes.filter(c => !c.requis)

  return (
    <details className="advanced">
      <summary>
        Colonnes attendues ({indispensables.length} indispensables, {facultatives.length} facultatives)
      </summary>
      <div className="colonnes-attendues">
        <h4>Indispensables</h4>
        <ListeColonnes colonnes={indispensables} />
        <h4>Facultatives</h4>
        <ListeColonnes colonnes={facultatives} />
        <p className="hint">
          Le nom en gris est un exemple d’intitulé. Les accents, les majuscules et les variantes courantes (« Nom de
          l’école », « nb_classes »…) sont reconnus ; ce qui ne l’est pas sera à indiquer à l’étape « Correspondance des
          colonnes ». L’ordre des colonnes n’a pas d’importance.
        </p>
      </div>
    </details>
  )
}
