'use client'

/**
 * Postes à couvrir du scénario affiché (vue analyste), classés par le serveur
 * selon le poids du poste Up = wp + βp (note, §3.3).
 */

import { SANS_PAGINATION, type TeachingPost } from '@shared/api'
import { LIBELLE_SOUS_SYSTEME, rangZoneSecurite } from '@shared/kernel'
import { useSession } from '@shared/session'
import { DataTable, Notice, Panel, Pill, ZoneSecuritePill, fmt, type Colonne } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'

import { usePostes } from '../../application/hooks'
import { useScenarioAffiche } from '../../application/scenarioAffiche'
import { SansScenario } from '../composants/SansScenario'

/** Colonnes de la liste des postes. */
const COLONNES: Colonne<TeachingPost>[] = [
  { cle: 'rang', entete: 'Rang', numerique: true, rendu: p => fmt(p.rang), tri: p => p.rang },
  { cle: 'id', entete: 'Poste', rendu: p => <span className="mono">{p.id}</span>, tri: p => p.id },
  {
    cle: 'etab',
    entete: 'Établissement',
    rendu: p => (
      <span>
        <strong>{p.nomEtab || p.schoolId}</strong>
        <small>
          {p.commune} · {p.departement}
        </small>
      </span>
    ),
    tri: p => p.nomEtab,
  },
  { cle: 'region', entete: 'Région', rendu: p => p.region, tri: p => p.region },
  {
    cle: 'securite',
    entete: 'Sécurité',
    rendu: p => <ZoneSecuritePill zone={p.priorite.zoneSecurite} points={p.priorite.pointsSecurite} court />,
    tri: p => rangZoneSecurite(p.priorite.zoneSecurite),
  },
  {
    cle: 'ss',
    entete: 'Sous-système',
    rendu: p => (p.sousSysteme ? LIBELLE_SOUS_SYSTEME[p.sousSysteme] : '—'),
    tri: p => p.sousSysteme ?? '',
  },
  { cle: 'w', entete: 'Poids w', numerique: true, rendu: p => fmt(p.priorite.poids), tri: p => p.priorite.poids },
  {
    cle: 'niveau',
    entete: 'Niveau',
    numerique: true,
    rendu: p => fmt(p.priorite.niveauDifficulte),
    tri: p => p.priorite.niveauDifficulte,
  },
  {
    cle: 'beta',
    entete: 'β',
    numerique: true,
    rendu: p => fmt(p.priorite.pointsBesoin),
    tri: p => p.priorite.pointsBesoin,
  },
  {
    cle: 'u',
    entete: 'Indice u',
    numerique: true,
    rendu: p => (
      <span>
        {fmt(p.priorite.indice)}
        {p.estStructure && <small>structure</small>}
      </span>
    ),
    tri: p => p.priorite.indice,
  },
  {
    cle: 'etat',
    entete: 'État',
    rendu: p => <Pill tone={p.pourvu ? 'ok' : 'warn'}>{p.pourvu ? 'Pourvu (proposition)' : 'Non pourvu'}</Pill>,
    tri: p => (p.pourvu ? 1 : 0),
  },
]

/** Page « Postes » (vue analyste). */
export function PostesPage() {
  const { jeu } = useSession()
  const { scenario } = useScenarioAffiche()
  const postes = usePostes(jeu, scenario, SANS_PAGINATION)

  if (!scenario) return <SansScenario texte="Les postes à couvrir sont construits lors de l’exécution d’un scénario." />
  if (!postes.data) return <EtatRequetes requetes={[postes]} />

  return (
    <div className="stack">
      <Notice tone="neutral" title="Référentiel des écoles nécessiteuses et des structures d’accueil (§3.1).">
        Un poste = une unité de besoin b d’une école nécessiteuse, ou une place d’une structure fixée par la hiérarchie.
        Les postes sont classés par indice de priorité u = w + β décroissant ; à indice égal, les écoles passent avant
        les structures, puis l’école au taux d’encadrement actuel le plus élevé.
      </Notice>
      <Panel kicker="Postes" title={`${fmt(postes.data.total)} postes à couvrir`} flush>
        <DataTable
          lignes={postes.data.elements}
          colonnes={COLONNES}
          cle={p => p.id}
          legende="Postes à couvrir et leur état"
        />
      </Panel>
    </div>
  )
}
