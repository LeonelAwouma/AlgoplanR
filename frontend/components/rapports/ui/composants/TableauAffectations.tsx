'use client'

/**
 * Propositions d'affectation du scénario affiché, pour le territoire filtré.
 *
 * Deux présentations des mêmes données :
 * - à l'écran, une consultation paginée (50 ou 100 lignes) et filtrable, sans barre de défilement vertical ;
 * - au papier / PDF, le tableau complet (toutes les lignes, en paysage, en-têtes répétés), indépendant de la page et
 *   des filtres de la consultation.
 * L'annexe Word reprend aussi toutes les lignes (voir `export-docx.ts`).
 */

import { useMemo, useState } from 'react'

import type { SimulationResult } from '@shared/api'
import { MENTION_SIMULATION } from '@shared/kernel'
import { fmt } from '@shared/ui/commun'

import {
  COLONNES_CONSULTATION,
  ENTETES_AFFECTATIONS,
  FILTRES_AFFECTATIONS_VIDES,
  TAILLES_PAGE,
  filtrerLignes,
  lignesAffectations,
  optionsFiltre,
  paginer,
  type FiltresAffectations,
} from '../../domain/affectations'

/** Colonnes numériques, alignées à droite. */
const COLONNES_NUMERIQUES = new Set<number>([0, 13, 14])

export interface ProprietesTableauAffectations {
  /** Résultat du scénario affiché, restreint au territoire ; `null` en situation actuelle (aucune simulation). */
  resultat: SimulationResult | null
}

/** Consultation paginée et filtrable (écran seulement). */
function Consultation({ lignes }: { lignes: string[][] }) {
  const [filtres, setFiltres] = useState<FiltresAffectations>(FILTRES_AFFECTATIONS_VIDES)
  const [taille, setTaille] = useState<number>(TAILLES_PAGE[0])
  const [page, setPage] = useState(1)

  const retenues = useMemo(() => filtrerLignes(lignes, filtres), [lignes, filtres])
  const courante = paginer(retenues, page, taille)

  const regions = useMemo(() => optionsFiltre(lignes, 'region', filtres), [lignes, filtres])
  const departements = useMemo(() => optionsFiltre(lignes, 'departement', filtres), [lignes, filtres])
  const communes = useMemo(() => optionsFiltre(lignes, 'commune', filtres), [lignes, filtres])

  /** Un filtre territorial vide les filtres qui en dépendent ; la consultation revient à la première page. */
  function changer(patch: Partial<FiltresAffectations>) {
    const suivant = { ...filtres, ...patch }
    if ('region' in patch) Object.assign(suivant, { departement: '', commune: '' })
    if ('departement' in patch) suivant.commune = ''
    setFiltres(suivant)
    setPage(1)
  }

  const select = (id: string, libelle: string, valeur: string, options: string[], cle: keyof FiltresAffectations) => (
    <div className="field">
      <label htmlFor={id}>{libelle}</label>
      <select id={id} value={valeur} onChange={e => changer({ [cle]: e.target.value })}>
        <option value="">Tous</option>
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="no-print consultation-affectations">
      <h2>Consulter les affectations</h2>
      <p>
        {fmt(lignes.length)} proposition(s) d’affectation. Cette consultation est paginée ; l’impression, le PDF et
        l’annexe Word reprennent les {fmt(lignes.length)} propositions, quelle que soit la page affichée.
      </p>
      <div className="param-grid">
        {select('aff-region', 'Région', filtres.region, regions, 'region')}
        {select('aff-dept', 'Département', filtres.departement, departements, 'departement')}
        {select('aff-commune', 'Commune', filtres.commune, communes, 'commune')}
        <div className="field">
          <label htmlFor="aff-recherche">Rechercher</label>
          <input
            id="aff-recherche"
            type="search"
            placeholder="Matricule, nom, école…"
            value={filtres.recherche}
            onChange={e => changer({ recherche: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="aff-taille">Lignes par page</label>
          <select
            id="aff-taille"
            value={taille}
            onChange={e => {
              setTaille(Number(e.target.value))
              setPage(1)
            }}
          >
            {TAILLES_PAGE.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {retenues.length === 0 ? (
        <p className="hint">Aucune proposition ne correspond à ces filtres.</p>
      ) : (
        <div className="table-defile-x">
          <table>
            <thead>
              <tr>
                {COLONNES_CONSULTATION.map(j => (
                  <th key={j} scope="col" className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                    {ENTETES_AFFECTATIONS[j]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courante.lignes.map(ligne => (
                <tr key={ligne[0]}>
                  {COLONNES_CONSULTATION.map(j => (
                    <td key={j} className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                      {ligne[j]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="pagination" aria-label="Pages des affectations">
        <span>
          {courante.total === 0
            ? '0 proposition'
            : `Propositions ${fmt(courante.de)} à ${fmt(courante.a)} sur ${fmt(courante.total)}`}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={courante.page <= 1}
          onClick={() => setPage(courante.page - 1)}
        >
          Précédente
        </button>
        <span>
          Page {courante.page} / {courante.pages}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={courante.page >= courante.pages}
          onClick={() => setPage(courante.page + 1)}
        >
          Suivante
        </button>
      </nav>
    </div>
  )
}

/** Section « Propositions d'affectation » du document du rapport. */
export function TableauAffectations({ resultat }: ProprietesTableauAffectations) {
  const lignes = useMemo(() => (resultat ? lignesAffectations(resultat.assignments) : []), [resultat])

  return (
    <section>
      {lignes.length === 0 ? (
        <>
          <h2>Propositions d’affectation</h2>
          <p>Aucune proposition d’affectation pour ce scénario et ce périmètre.</p>
        </>
      ) : (
        <>
          <Consultation lignes={lignes} />

          {/* Version papier / PDF : toutes les lignes, indépendantes de la consultation ci-dessus. */}
          <div className="print-only report-affectations">
            <h2>Annexe A — Propositions d’affectation</h2>
            <p>
              {fmt(lignes.length)} proposition(s) d’affectation, rangée(s) par région, département, commune et école de
              destination. {MENTION_SIMULATION}
            </p>
            <table>
              <thead>
                <tr>
                  {ENTETES_AFFECTATIONS.map((e, j) => (
                    <th key={e} scope="col" className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(ligne => (
                  <tr key={ligne[0]}>
                    {ligne.map((cellule, j) => (
                      <td key={j} className={COLONNES_NUMERIQUES.has(j) ? 'num' : undefined}>
                        {cellule}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
