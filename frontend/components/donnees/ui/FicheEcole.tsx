'use client'

/**
 * Fiche détaillée d'un établissement (§9).
 *
 * La fiche explique la situation de l'école avec les seules valeurs calculées
 * par le serveur : aucune justification n'est produite quand la donnée qui la
 * fonderait est absente du fichier.
 */

import { ArrowLeft, Info } from 'lucide-react'

import { NIVEAUX_PRIMAIRE } from '@shared/api'
import { LIBELLE_ZONE } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Panel, Pill, ZoneSecuritePill, fmt, fmtDec } from '@shared/ui/commun'
import { EtatRequetes } from '@shared/ui/etats'
import { SeveritePill } from '@shared/ui/pastilles'
import { useParametres } from '@components/parametrage'

import { useEtablissement } from '../application/hooks'
import { CalculBesoinEcole } from './composants/CalculBesoinEcole'
import { MouvementsEcole } from './composants/MouvementsEcole'

/** Valeur numérique, ou « Non renseigné » quand le fichier ne la fournit pas. */
function renseigne(valeur: number | null): string {
  return valeur == null ? 'Non renseigné' : fmt(valeur)
}

export interface ProprietesFicheEcole {
  ecole: string
  onRetour: () => void
}

/** Fiche d'une école : identité, effectifs, calcul du besoin, priorités et mouvements proposés. */
export function FicheEcole({ ecole, onRetour }: ProprietesFicheEcole) {
  const { jeu } = useSession()
  const fiche = useEtablissement(jeu, ecole)
  const parametres = useParametres(jeu)

  const retour = (
    <button type="button" className="btn btn-sm btn-retour" onClick={onRetour}>
      <ArrowLeft size={13} aria-hidden="true" /> Retour à la liste
    </button>
  )

  if (!jeu || !fiche.data) {
    return (
      <div className="stack">
        {retour}
        <EtatRequetes requetes={[fiche]} />
      </div>
    )
  }

  const d = fiche.data.diagnostic
  const { school } = d
  const niveaux = NIVEAUX_PRIMAIRE.filter(n => school.effectifParNiveau[n] != null)

  return (
    <div className="stack">
      {retour}

      <Panel>
        <div className="detail-head">
          <div className="detail-title">
            <p className="eyebrow">
              {school.typeEtab || 'Établissement'} · {school.id}
            </p>
            <h2>{school.nom || school.id}</h2>
            <p className="detail-path">
              {school.region || '—'} › {school.departement || '—'} › {school.commune || '—'}
            </p>
          </div>
          <div className="topbar-actions">
            <SeveritePill severite={d.severite} />
            <Pill tone="neutral">{LIBELLE_ZONE[school.zone]}</Pill>
            <ZoneSecuritePill zone={school.zoneSecurite} points={d.priorite.pointsSecurite} />
            {school.classesMultigrades > 0 && (
              <Pill tone="warn">{school.classesMultigrades} classe(s) multigrade(s)</Pill>
            )}
            {school.prioriteLocale > 0 && <Pill tone="info">Priorité locale {school.prioriteLocale}</Pill>}
          </div>
        </div>

        <dl className="def-grid">
          <div>
            <dt>Classes (salles)</dt>
            <dd>{renseigne(school.nbSallesClasse)}</dd>
          </div>
          <div>
            <dt>Classes ouvertes</dt>
            <dd>{renseigne(school.nombreClassesOuvertes)}</dd>
          </div>
          <div>
            <dt>Capacité en maîtres (salles)</dt>
            <dd>{school.sallesRenseignees ? fmt(school.capaciteMaitres) : 'Capacité inconnue'}</dd>
          </div>
          <div>
            <dt>Élèves</dt>
            <dd>{renseigne(school.effectifTotalEleves)}</dd>
          </div>
          <div>
            <dt>Dont filles</dt>
            <dd>{renseigne(school.effectifFilles)}</dd>
          </div>
          <div>
            <dt>Enseignants payés par l’État</dt>
            <dd>{fmt(d.enseignantsEtat)}</dd>
          </div>
          <div>
            <dt>Autres enseignants</dt>
            <dd>{renseigne(school.nbAutresEnseignants)}</dd>
          </div>
          <div>
            <dt>Élèves par enseignant</dt>
            <dd>{fmtDec(d.elevesParEnseignant, 1)}</dd>
          </div>
          <div>
            <dt>Élèves par enseignant État</dt>
            <dd>{fmtDec(d.elevesParEnseignantEtat, 1)}</dd>
          </div>
          <div>
            <dt>Élèves par classe</dt>
            <dd>{fmtDec(d.elevesParClasse, 1)}</dd>
          </div>
          <div>
            <dt>Postes ouverts déclarés</dt>
            <dd>{renseigne(d.postesDeclares)}</dd>
          </div>
          <div>
            <dt>Besoin calculé</dt>
            <dd>{fmt(d.besoinTheorique)}</dd>
          </div>
          <div>
            <dt>Excédent mobilisable</dt>
            <dd>
              {fmt(d.calcul.excedentSur ?? d.excedentTheorique)}
              {!!d.calcul.excedentAVerifier && ` (+ ${fmt(d.calcul.excedentAVerifier)} à vérifier)`}
            </dd>
          </div>
        </dl>

        {niveaux.length > 0 && (
          <details className="advanced">
            <summary>Effectifs par niveau</summary>
            <dl className="def-grid">
              {niveaux.map(n => (
                <div key={n}>
                  <dt>{n}</dt>
                  <dd>{fmt(school.effectifParNiveau[n] ?? null)}</dd>
                </div>
              ))}
              <div>
                <dt>Effectif moyen par niveau</dt>
                <dd>{fmtDec(d.effectifMoyenParNiveau, 1)}</dd>
              </div>
            </dl>
          </details>
        )}
      </Panel>

      <div className="grid-2">
        <CalculBesoinEcole diagnostic={d} elevesParMaitre={parametres.data?.besoin.elevesParMaitre ?? null} />

        <Panel kicker="Explication" title="Pourquoi cette école apparaît-elle dans les priorités ?">
          {d.raisons.length === 0 ? (
            <p className="hint">
              Cette école ne présente ni déficit, ni signal particulier au regard des données disponibles. Elle
              n’apparaît pas dans les priorités.
            </p>
          ) : (
            <ul className="reason-list">
              {d.raisons.map(r => (
                <li key={r.code}>
                  <Info size={15} aria-hidden="true" />
                  <span>{r.texte}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <MouvementsEcole jeu={jeu} ecole={school.id} plafondDeparts={d.excedentTheorique} />
    </div>
  )
}
