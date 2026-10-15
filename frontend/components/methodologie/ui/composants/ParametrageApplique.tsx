'use client'

/** Valeurs des règles effectivement appliquées, telles que le serveur les renvoie. */

import type { EngineSettings } from '@shared/api'
import { Panel } from '@shared/ui/commun'

/** Libellé de la source des postes à couvrir. */
const LIBELLE_SOURCE_POSTES: Record<EngineSettings['sourceDesPostes'], string> = {
  besoinCalcule: 'Besoin calculé',
  postesDeclares: 'Postes déclarés',
  maximum: 'Maximum des deux',
}

/** Une ligne « règle — valeur ». */
function Valeur({ libelle, valeur, texte = false }: { libelle: string; valeur: string; texte?: boolean }) {
  return (
    <div>
      <dt>{libelle}</dt>
      <dd className={texte ? 'dd-texte' : undefined}>{valeur}</dd>
    </div>
  )
}

export interface ProprietesParametrageApplique {
  parametres: EngineSettings
  /** Vrai quand aucun jeu n'est ouvert : les valeurs affichées sont celles par défaut. */
  parDefaut: boolean
}

/** Panneau « Valeurs effectivement appliquées ». */
export function ParametrageApplique({ parametres: p, parDefaut }: ProprietesParametrageApplique) {
  return (
    <Panel kicker="Paramétrage actuel" title={parDefaut ? 'Valeurs par défaut' : 'Valeurs effectivement appliquées'}>
      <dl className="def-grid">
        <Valeur libelle="Année scolaire" valeur={p.anneeScolaire} texte />
        <Valeur libelle="Un maître pour" valeur={`${p.besoin.elevesParMaitre} élèves`} />
        <Valeur libelle="Tolérance d’arrondi" valeur={`${p.besoin.toleranceArrondi} élève(s)`} />
        <Valeur libelle="Niveaux tenus par un maître" valeur={String(p.besoin.niveauxParMaitre)} />
        <Valeur libelle="Double flux" valeur={p.besoin.doubleFluxAutorise ? 'Autorisé' : 'Non autorisé'} texte />
        <Valeur libelle="Âge de la retraite" valeur={`${p.besoin.ageRetraite} ans`} />
        <Valeur libelle="Stabilité minimale au poste" valeur={`${p.mobilite.stabiliteMinimaleAns} ans`} />
        <Valeur
          libelle="Ordre d’examen des vœux"
          valeur={p.mobilite.ordreExamen === 'voeux' ? 'Ordre de l’enseignant' : 'Poids des écoles'}
          texte
        />
        <Valeur
          libelle="Attrition hors retraite"
          valeur={`${p.recrutement.tauxAttritionHorsRetraite.toLocaleString('fr-FR')} %`}
        />
        <Valeur libelle="Source des postes" valeur={LIBELLE_SOURCE_POSTES[p.sourceDesPostes]} texte />
        <Valeur libelle="Seuil déficit faible" valeur={`${Math.round(p.seuilsSeverite.faible * 100)} %`} />
        <Valeur libelle="Seuil déficit important" valeur={`${Math.round(p.seuilsSeverite.important * 100)} %`} />
      </dl>
      <p className="hint">
        Valeurs par défaut du Référentiel technique de modélisation, désignées par lui comme paramètres à valider par la
        DRH. Elles sont modifiables depuis le Référentiel ; chaque changement relance le calcul sur le serveur.
      </p>
    </Panel>
  )
}
