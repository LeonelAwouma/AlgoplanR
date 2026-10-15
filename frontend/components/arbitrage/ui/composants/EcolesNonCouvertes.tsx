'use client'

/**
 * Écoles restées sans maître dans le scénario, par ordre de priorité, avec les
 * combinaisons de redéploiement que le serveur propose à la commission.
 */

import type { CombinaisonArbitrage, EcoleNonCouverte } from '@shared/api'
import { Panel, Pill, ZoneSecuritePill, fmt } from '@shared/ui/commun'

/** Nombre d'écoles listées. */
const ECOLES_AFFICHEES = 40

/** Libellé du type de combinaison. */
const LIBELLE_COMBINAISON: Record<CombinaisonArbitrage['type'], string> = {
  direct: 'Direct',
  chaine: 'Chaîne',
  permutation: 'Permutation',
}

/** Panneau « Écoles non couvertes ». */
export function EcolesNonCouvertes({ ecoles }: { ecoles: EcoleNonCouverte[] }) {
  return (
    <Panel
      kicker="Écoles non couvertes"
      title={`${fmt(ecoles.length)} école(s) restée(s) sans maître, par ordre de priorité`}
      hint="Combinaisons proposées automatiquement, avant le redéploiement obligatoire : redéploiement direct depuis l’école excédentaire la plus proche, chaîne de mouvements, permutation."
    >
      {ecoles.length === 0 ? (
        <p className="hint">Toutes les écoles nécessiteuses sont couvertes dans ce scénario.</p>
      ) : (
        <ul className="acces-demandes">
          {ecoles.slice(0, ECOLES_AFFICHEES).map(e => (
            <li key={e.schoolId} className="bloc">
              <strong>
                {e.nom} — {e.commune}
              </strong>{' '}
              <ZoneSecuritePill zone={e.zoneSecurite} />
              <span>
                {' '}
                · indice u = {fmt(e.indice)} · {fmt(e.postes)} poste(s) ouvert(s)
                {e.zoneRouge ? ' · zone rouge : volontaires, primes ou recrutement uniquement' : ''}
              </span>
              {e.combinaisons.length === 0 ? (
                <span className="bloc combinaison">
                  Aucune combinaison volontaire : redéploiement obligatoire ou recrutement.
                </span>
              ) : (
                e.combinaisons.map((c, i) => (
                  <span key={`${c.type}-${i}`} className="bloc combinaison">
                    <Pill tone="info">{LIBELLE_COMBINAISON[c.type]}</Pill> {c.description}
                  </span>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
