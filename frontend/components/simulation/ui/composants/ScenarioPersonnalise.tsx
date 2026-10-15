'use client'

/**
 * Construction d'un scénario personnalisé : périmètre et règles modifiés à
 * partir des règles en vigueur. Les paramètres retenus sont figés dans le
 * scénario par le serveur : son résultat reste reproductible.
 */

import { useState } from 'react'
import { Play } from 'lucide-react'

import type { EngineSettings, GeographicScope, IdJeu, OrdreExamenVoeux } from '@shared/api'
import { AVERTISSEMENT_SCENARIO_ETENDU, LIBELLE_SCOPE, cloner } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'
import { ErreurAction } from '@shared/ui/etats'

import { useCreerScenario } from '../../application/hooks'

export interface ProprietesScenarioPersonnalise {
  jeu: IdJeu
  /** Règles en vigueur, point de départ du formulaire. */
  parametres: EngineSettings
  onScenarioCree: (scenario: string) => void
}

/** Case à cocher d'une règle, avec son explication. */
function Regle({
  libelle,
  explication,
  coche,
  onChange,
}: {
  libelle: string
  explication: string
  coche: boolean
  onChange: (coche: boolean) => void
}) {
  return (
    <label className="switch-row">
      <input type="checkbox" checked={coche} onChange={e => onChange(e.target.checked)} />
      <span>
        <b>{libelle}</b>
        <span>{explication}</span>
      </span>
    </label>
  )
}

/** Panneau « Construire un scénario personnalisé ». */
export function ScenarioPersonnalise({ jeu, parametres, onScenarioCree }: ProprietesScenarioPersonnalise) {
  const creation = useCreerScenario(jeu)

  const [nom, setNom] = useState('')
  const [scope, setScope] = useState<GeographicScope>('departement')
  const [stabilite, setStabilite] = useState(parametres.mobilite.stabiliteMinimaleAns)
  const [norme, setNorme] = useState(parametres.besoin.elevesParMaitre)
  const [tolerance, setTolerance] = useState(parametres.besoin.toleranceArrondi)
  const [niveauxParMaitre, setNiveauxParMaitre] = useState(parametres.besoin.niveauxParMaitre)
  const [ordre, setOrdre] = useState<OrdreExamenVoeux>(parametres.mobilite.ordreExamen)
  const [doubleFlux, setDoubleFlux] = useState(parametres.besoin.doubleFluxAutorise)
  const [solutionProche, setSolutionProche] = useState(parametres.mobilite.solutionProche)
  const [obligatoire, setObligatoire] = useState(parametres.mobilite.redeploiementObligatoire)
  const [zoneRouge, setZoneRouge] = useState(parametres.mobilite.regleZoneRouge)

  /** Description lisible du scénario, enregistrée avec lui. */
  function description(): string {
    return [
      `Périmètre ${LIBELLE_SCOPE[scope].toLowerCase()}`,
      `un maître pour ${norme} élèves${tolerance > 0 ? ` (tolérance ${tolerance})` : ''}`,
      `${niveauxParMaitre} niveau(x) par maître`,
      `stabilité ${stabilite} ans`,
      `vœux examinés ${ordre === 'voeux' ? "dans l'ordre de l'enseignant" : 'par poids des écoles'}`,
      ...(doubleFlux ? [] : ['sans double flux']),
      ...(obligatoire ? [] : ['sans redéploiement obligatoire']),
    ].join(', ')
  }

  function executer() {
    // Les règles du formulaire s'appliquent sur une copie des règles en vigueur.
    const regles = cloner(parametres)
    regles.mobilite.stabiliteMinimaleAns = stabilite
    regles.mobilite.ordreExamen = ordre
    regles.mobilite.solutionProche = solutionProche
    regles.mobilite.redeploiementObligatoire = obligatoire
    regles.mobilite.regleZoneRouge = zoneRouge
    regles.besoin.elevesParMaitre = norme
    regles.besoin.toleranceArrondi = tolerance
    regles.besoin.niveauxParMaitre = niveauxParMaitre
    regles.besoin.doubleFluxAutorise = doubleFlux

    creation.mutate(
      { personnalise: { nom, description: `${description()}.`, scope, parametres: regles } },
      { onSuccess: cree => onScenarioCree(cree.scenario.id) },
    )
  }

  return (
    <Panel
      kicker="Nouveau scénario"
      title="Construire un scénario personnalisé"
      hint="Modifiez le périmètre et les règles, puis exécutez. Les paramètres retenus sont figés dans le scénario : son résultat reste reproductible."
    >
      <div className="param-grid">
        <div className="field">
          <label htmlFor="sc-nom">Nom du scénario</label>
          <input
            id="sc-nom"
            type="text"
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Ex. : priorité rurale, département"
          />
        </div>
        <div className="field">
          <label htmlFor="sc-scope">Rayon territorial</label>
          <select id="sc-scope" value={scope} onChange={e => setScope(e.target.value as GeographicScope)}>
            <option value="commune">Commune — mouvements internes à la commune</option>
            <option value="departement">Département — mouvements internes au département</option>
            <option value="etendu">Étendu — niveau régional puis niveau central</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-norme">Un maître pour (élèves)</label>
          <input
            id="sc-norme"
            type="number"
            min={20}
            max={120}
            value={norme}
            onChange={e => setNorme(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="sc-tol">Tolérance d’arrondi (élèves)</label>
          <input
            id="sc-tol"
            type="number"
            min={0}
            max={59}
            value={tolerance}
            onChange={e => setTolerance(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="sc-niv">Niveaux tenus par un maître</label>
          <select id="sc-niv" value={niveauxParMaitre} onChange={e => setNiveauxParMaitre(Number(e.target.value))}>
            <option value={1}>1 — chaque niveau a son maître</option>
            <option value={2}>2 — niveaux regroupés deux à deux</option>
            <option value={3}>3 — niveaux regroupés trois à trois</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-stab">Stabilité minimale au poste (ans)</label>
          <input
            id="sc-stab"
            type="number"
            min={0}
            max={20}
            value={stabilite}
            onChange={e => setStabilite(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="sc-ordre">Ordre d’examen des vœux</label>
          <select id="sc-ordre" value={ordre} onChange={e => setOrdre(e.target.value as OrdreExamenVoeux)}>
            <option value="voeux">Ordre choisi par l’enseignant (par défaut)</option>
            <option value="poids">Poids des écoles (variante)</option>
          </select>
        </div>
      </div>

      <div className="switch-list">
        <Regle
          libelle="Double flux autorisé"
          explication="Une salle en double flux compte pour deux maîtres dans BMAX."
          coche={doubleFlux}
          onChange={setDoubleFlux}
        />
        <Regle
          libelle="Solution la plus proche pour les demandes non satisfaites"
          explication="Proposition hors vœux, dans la commune, le département puis la région des écoles demandées."
          coche={solutionProche}
          onChange={setSolutionProche}
        />
        <Regle
          libelle="Redéploiement obligatoire"
          explication="Les écoles restées non couvertes reçoivent un maître d’une école excédentaire du même sous-système."
          coche={obligatoire}
          onChange={setObligatoire}
        />
        <Regle
          libelle="Règle de la zone rouge"
          explication="Aucun poste en zone rouge n’est proposé hors vœux ni imposé."
          coche={zoneRouge}
          onChange={setZoneRouge}
        />
      </div>

      {scope === 'etendu' && (
        <Notice tone="warn" title="Scénario étendu : mouvements entre régions possibles.">
          {AVERTISSEMENT_SCENARIO_ETENDU}
        </Notice>
      )}

      <ErreurAction erreur={creation.error} />

      <div className="topbar-actions actions-formulaire">
        <button type="button" className="btn btn-primary" onClick={executer} disabled={creation.isPending}>
          <Play size={14} aria-hidden="true" /> Exécuter ce scénario
        </button>
      </div>
    </Panel>
  )
}
