'use client'

/**
 * Chaque établissement placé selon sa cible K et ses maîtres retenus E. La
 * droite E = K sépare les écoles en déficit (dessous) de celles en excédent
 * (dessus). Au-delà de `POINTS_MAX` établissements, un échantillon régulier est
 * représenté pour que le graphique reste lisible et léger.
 */

import { useMemo } from 'react'

import type { SchoolDiagnostic } from '@shared/api'
import { Panel, fmt } from '@shared/ui/commun'
import { Nuage, type PointNuage } from '@shared/ui/graphiques'

/** Nombre maximal de points dessinés. */
const POINTS_MAX = 1200

export interface ProprietesNuageEcoles {
  ecoles: SchoolDiagnostic[]
  /** Norme d'encadrement, rappelée dans l'explication. */
  elevesParMaitre: number | null
  onOuvrirEcole: (ecole: string) => void
}

/** Panneau « Chaque école face à sa cible ». */
export function NuageEcoles({ ecoles, elevesParMaitre, onOuvrirEcole }: ProprietesNuageEcoles) {
  const { points, echantillonne } = useMemo(() => {
    const pas = ecoles.length > POINTS_MAX ? Math.ceil(ecoles.length / POINTS_MAX) : 1
    const retenus: PointNuage[] = []
    for (let i = 0; i < ecoles.length; i += pas) {
      const d = ecoles[i]
      retenus.push({
        cle: d.school.id,
        label: d.school.nom || d.school.id,
        x: d.calcul.cible,
        y: d.enseignantsEtat,
        categorie: d.besoinTheorique > 0 ? 'deficit' : d.excedentTheorique > 0 ? 'excedent' : 'equilibre',
        onSelect: () => onOuvrirEcole(d.school.id),
      })
    }
    return { points: retenus, echantillonne: pas > 1 }
  }, [ecoles, onOuvrirEcole])

  const norme = elevesParMaitre == null ? '' : ` : un maître pour ${elevesParMaitre} élèves`
  const echantillon = echantillonne
    ? ` Échantillon régulier de ${fmt(points.length)} établissements sur ${fmt(ecoles.length)}, pour préserver la lisibilité.`
    : ''

  return (
    <Panel
      kicker="Établissements"
      title="Chaque école face à sa cible"
      hint={`Un point par établissement : sa cible K en abscisse (maîtres dont les élèves ont besoin, dans la limite de ce que les salles permettent${norme}), ses maîtres retenus à la rentrée en ordonnée. Sous la diagonale, l’école manque de maîtres. Cliquez un point pour ouvrir la fiche.${echantillon}`}
    >
      <Nuage
        titre="Classes et enseignants par établissement"
        points={points}
        categories={[
          { cle: 'deficit', label: 'En déficit', couleur: '#a8453f', forme: 'triangle' },
          { cle: 'equilibre', label: 'À l’équilibre', couleur: 'var(--serie-3)', forme: 'cercle' },
          { cle: 'excedent', label: 'Avec excédent mobilisable', couleur: 'var(--serie-1)', forme: 'carre' },
        ]}
        axeX={{ label: 'Cible K (maîtres)' }}
        axeY={{ label: 'Maîtres retenus E' }}
        reference={{ pente: 1, label: 'E = K' }}
      />
    </Panel>
  )
}
