'use client'

/**
 * Vivier et postes ouverts (mémo de synthèse, §2.2) : identifier les personnes
 * disponibles, les rapprocher des postes ouverts et proposer leur nomination.
 * Le rapprochement est calculé par le serveur ; la proposition reste une
 * décision humaine, suivie ensuite dans « Nominations ».
 */

import { useState } from 'react'

import { useSession } from '@shared/session'
import { Notice, Panel } from '@shared/ui/commun'
import { ChargementEnCours } from '@shared/ui/etats'
import { Onglets } from '@shared/ui/Onglets'

import { FichePersonneVivier } from './composants/FichePersonneVivier'
import { ImportVivier } from './composants/ImportVivier'
import { PersonnesVivier } from './composants/PersonnesVivier'
import { PostesOuverts } from './composants/PostesOuverts'

const ONGLETS = [
  { cle: 'personnes', libelle: 'Personnes disponibles' },
  { cle: 'postes', libelle: 'Postes ouverts' },
] as const

type CleOnglet = (typeof ONGLETS)[number]['cle']

/** Page « Vivier et postes ouverts ». */
export function VivierPage() {
  const { jeu } = useSession()
  const [onglet, setOnglet] = useState<CleOnglet>('personnes')
  const [personne, setPersonne] = useState<string | null>(null)

  if (!jeu) return <ChargementEnCours />

  return (
    <div className="stack">
      <Notice tone="info" title="Une personne, un poste, une décision.">
        Le vivier réunit les personnes disponibles : enseignants excédentaires restés sans affectation, lauréats sans
        poste et, selon la portée retenue, d’autres sources. Une personne déjà proposée ou nommée, un poste déjà
        réservé, ne peuvent pas être comptés deux fois.
      </Notice>

      <Panel kicker="Vivier" title="Rapprocher les personnes et les postes" flush>
        <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} libelle="Vivier et postes">
          <div className="onglet-contenu">
            {onglet === 'personnes' ? (
              <PersonnesVivier jeu={jeu} selection={personne} onSelection={setPersonne} />
            ) : (
              <PostesOuverts jeu={jeu} />
            )}
          </div>
        </Onglets>
      </Panel>

      {onglet === 'personnes' && personne && (
        <FichePersonneVivier key={personne} jeu={jeu} personne={personne} onFermer={() => setPersonne(null)} />
      )}

      <ImportVivier jeu={jeu} />
    </div>
  )
}
