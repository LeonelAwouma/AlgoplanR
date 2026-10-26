'use client'

/**
 * Vérification des sources avant une décision individuelle. Quand le stock déclaré d'une école diffère du nombre
 * d'agents nominatifs qui lui sont rattachés, le bornage au stock n'est qu'une protection arithmétique : une
 * nomination, un mouvement ou une affectation qui s'appuie sur cette école exige que la vérification des sources soit
 * reconnue. Les simulations et consultations n'en dépendent pas. Les écarts viennent du serveur.
 */

import { ApiError } from '@shared/api'
import { Notice } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

interface EcartSources {
  id_ecole: string
  stock_declare: number
  agents_nominatifs: number
}

/** Écarts portés par un refus `verification_sources_requise`, ou `null` pour toute autre erreur. */
export function ecartsDuRefus(erreur: unknown): EcartSources[] | null {
  if (!(erreur instanceof ApiError) || erreur.code !== 'verification_sources_requise') return null
  const d = erreur.details as { ecoles?: EcartSources[] } | null
  return d?.ecoles?.length ? d.ecoles : null
}

interface Props {
  erreur: unknown
  reconnue: boolean
  onChange: (reconnue: boolean) => void
}

/** Erreur d'action, ou — pour des sources discordantes — la demande de reconnaître leur vérification. */
export function ErreurOuVerificationSources({ erreur, reconnue, onChange }: Props) {
  const ecarts = ecartsDuRefus(erreur)
  if (!ecarts) return <ErreurAction erreur={erreur} />
  return (
    <Notice tone="warn" title="Vérification des sources requise avant la décision.">
      <span className="ligne-pleine">
        Le stock déclaré et le nombre d’agents nominatifs diffèrent pour {ecarts.length} école(s) concernée(s) :{' '}
        {ecarts.map(e => `${e.id_ecole} (déclaré ${e.stock_declare}, nominatif ${e.agents_nominatifs})`).join(' ; ')}.
      </span>
      <label className="hint">
        <input type="checkbox" checked={reconnue} onChange={e => onChange(e.target.checked)} /> J’ai vérifié les sources
        de ces écoles ; la décision peut être prise. Cette vérification est consignée au journal.
      </label>
    </Notice>
  )
}
