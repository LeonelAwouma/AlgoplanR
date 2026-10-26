'use client'

/**
 * Avis sur la fiabilité des retraites du périmètre, fixé par le serveur : retraites non calculables (fichier nominatif
 * absent), partiellement identifiées, ou « 0 retraite » établi sur une population exploitable. Rien n'est reconstitué
 * ici : les textes sont ceux du serveur, repris à l'identique dans les exports.
 */

import type { FiabiliteRetraites } from '@shared/api'
import { Notice } from '@shared/ui/commun'

export function AvisRetraites({ fiabilite }: { fiabilite?: FiabiliteRetraites }) {
  if (!fiabilite || fiabilite.statut === 'complet') return null
  if (fiabilite.statut === 'non_calculable') {
    return (
      <Notice tone="alert" title="Retraites non calculables.">
        {fiabilite.message}
        {fiabilite.messageConditionnel && <span className="ligne-pleine">{fiabilite.messageConditionnel}</span>}
      </Notice>
    )
  }
  return (
    <Notice tone="warn" title="Retraites partiellement identifiées.">
      {fiabilite.message}
    </Notice>
  )
}
