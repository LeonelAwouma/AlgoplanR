'use client'

/**
 * Hypothèses de calcul de la planification (mémo de synthèse, §3) : elles
 * doivent être explicites, paramétrables et documentées. Les modifications
 * sont saisies dans un brouillon puis enregistrées avec un motif et un auteur ;
 * la version précédente est historisée et la planification recalculée.
 */

import { useState } from 'react'
import { Save, Undo2 } from 'lucide-react'

import { useSession } from '@shared/session'
import { Notice, Panel } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ChargementEnCours, EtatRequetes, ErreurAction } from '@shared/ui/etats'

import { useHypotheses, useModifierHypotheses } from '../application/hooks'
import { brouillonDepuis, corpsHypotheses, type BrouillonHypotheses } from '../domain/hypotheses'
import { HypothesesAttrition } from './composants/hypotheses/HypothesesAttrition'
import { HypothesesHorizonVivier } from './composants/hypotheses/HypothesesHorizonVivier'
import { HypothesesRetraite } from './composants/hypotheses/HypothesesRetraite'
import { DocumentationHypotheses, HistoriqueHypotheses } from './composants/hypotheses/SuiviHypotheses'

/** Page « Hypothèses de calcul ». */
export function HypothesesPage() {
  const { jeu } = useSession()
  const hypotheses = useHypotheses(jeu)
  const modification = useModifierHypotheses(jeu)
  const [auteur, setAuteur] = useAuteur()
  const [motif, setMotif] = useState('')
  const [brouillon, setBrouillon] = useState<BrouillonHypotheses | null>(null)

  if (!jeu) return <ChargementEnCours />
  if (!hypotheses.data) return <EtatRequetes requetes={[hypotheses]} />

  const h = hypotheses.data
  const affiche = brouillon ?? brouillonDepuis(h)
  const modifier = (suivant: BrouillonHypotheses) => setBrouillon(suivant)
  const pret = brouillon !== null && motif.trim() !== '' && auteur.trim() !== ''

  function enregistrer() {
    if (!brouillon) return
    modification.mutate(corpsHypotheses(brouillon, motif, auteur), {
      onSuccess: () => {
        setBrouillon(null)
        setMotif('')
      },
    })
  }

  return (
    <div className="stack">
      <Notice tone="info" title="Des hypothèses explicites et documentées.">
        Version {h.version}
        {h.modifieesLe ? `, modifiée le ${new Date(h.modifieesLe).toLocaleString('fr-FR')}` : ''}
        {h.modifieesPar ? ` par ${h.modifieesPar}` : ''}. Chaque valeur indique sa source et sa justification ; toute
        modification est historisée et relance la planification.
      </Notice>

      <HypothesesRetraite retraite={affiche.retraite} onChange={retraite => modifier({ ...affiche, retraite })} />
      <HypothesesAttrition
        jeu={jeu}
        attrition={affiche.attrition}
        onChange={attrition => modifier({ ...affiche, attrition })}
      />
      <HypothesesHorizonVivier brouillon={affiche} onChange={modifier} />

      <Panel kicker="Enregistrement" title="Enregistrer une nouvelle version des hypothèses">
        <div className="param-grid">
          <div className="field field-recherche">
            <label htmlFor="hy-motif">Motif de la modification</label>
            <input
              id="hy-motif"
              type="text"
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder="Ex. : taux d’attrition confirmé par la note de service n°…"
            />
          </div>
          <ChampAuteur auteur={auteur} onChange={setAuteur} />
        </div>
        <ErreurAction erreur={modification.error} />
        {modification.isSuccess && brouillon === null && (
          <Notice tone="info" title="Hypothèses enregistrées.">
            La planification a été recalculée avec ces hypothèses.
          </Notice>
        )}
        <div className="topbar-actions actions-formulaire">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pret || modification.isPending}
            onClick={enregistrer}
          >
            <Save size={14} aria-hidden="true" /> Enregistrer les hypothèses
          </button>
          <button type="button" className="btn" disabled={brouillon === null} onClick={() => setBrouillon(null)}>
            <Undo2 size={14} aria-hidden="true" /> Annuler les modifications
          </button>
        </div>
      </Panel>

      <DocumentationHypotheses jeu={jeu} />
      <HistoriqueHypotheses jeu={jeu} />
    </div>
  )
}
