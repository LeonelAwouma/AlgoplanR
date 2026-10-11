'use client'

/**
 * Écoles du périmètre par zone de sécurité (verte, jaune, rouge) : leur nombre,
 * leur besoin et, quand un scénario est affiché, les postes qui restent à
 * pourvoir. La zone pèse dans la priorité (points de sécurité du poids w) et,
 * en rouge, interdit tout poste imposé ou proposé hors vœux.
 */

import { ArrowRight } from 'lucide-react'

import type { EngineSettings, RepartitionZoneSecurite, ZoneSecurite } from '@shared/api'
import { LIBELLE_ZONE_SECURITE } from '@shared/kernel'
import { Panel, ZoneSecuritePill, fmt } from '@shared/ui/commun'

export interface ProprietesZonesSecuritePanel {
  zones: RepartitionZoneSecurite[]
  /** Règles en vigueur : points de sécurité et règle de la zone rouge. */
  parametres: EngineSettings | null
  /** Ouvre la liste des écoles filtrée sur une zone. */
  onVoirEcoles: (zone: ZoneSecurite) => void
}

/** Panneau « Écoles par zone de sécurité ». */
export function ZonesSecuritePanel({ zones, parametres, onVoirEcoles }: ProprietesZonesSecuritePanel) {
  if (zones.every(z => z.ecoles === 0)) return null

  return (
    <Panel
      kicker="Sécurité"
      title="Écoles par zone de sécurité"
      hint="Zone verte, jaune ou rouge, telle que déclarée dans le fichier des établissements. Elle entre dans la priorité des écoles et règle les affectations en zone rouge."
    >
      <div className="zones-securite-grille">
        {zones.map(z => (
          <section
            key={z.zone}
            className="zone-securite-carte"
            data-zone={z.zone}
            aria-label={LIBELLE_ZONE_SECURITE[z.zone]}
          >
            <ZoneSecuritePill zone={z.zone} />
            <p className="zone-securite-chiffre">{fmt(z.ecoles)}</p>
            <p className="hint sans-marge">
              école(s){z.nonRenseignees > 0 ? `, dont ${fmt(z.nonRenseignees)} sans zone renseignée` : ''}
            </p>
            <dl>
              <dt>En déficit</dt>
              <dd>{fmt(z.enDeficit)}</dd>
              <dt>Postes manquants</dt>
              <dd>{fmt(z.postesManquants)}</dd>
              {z.restantsApresScenario !== null && (
                <>
                  <dt>Restant après le scénario</dt>
                  <dd>{fmt(z.restantsApresScenario)}</dd>
                </>
              )}
              {parametres && (
                <>
                  <dt>Points de sécurité (w)</dt>
                  <dd>+{fmt(parametres.priorite.pointsSecurite[z.zone])}</dd>
                </>
              )}
            </dl>
            {z.zone === 'rouge' && parametres && (
              <p className="zone-securite-regle">
                {parametres.mobilite.regleZoneRouge
                  ? 'Aucun poste imposé ni proposé hors vœux : volontaires, primes ou recrutement uniquement.'
                  : 'Règle de la zone rouge désactivée dans le référentiel.'}
              </p>
            )}
            {z.ecoles > 0 && (
              <button type="button" className="btn btn-sm btn-espace" onClick={() => onVoirEcoles(z.zone)}>
                Voir ces écoles <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </section>
        ))}
      </div>
    </Panel>
  )
}
