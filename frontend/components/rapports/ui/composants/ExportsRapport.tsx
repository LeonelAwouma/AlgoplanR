'use client'

/**
 * Exports du rapport : impression, liste des écoles en Excel, rapport Word et
 * classeur Excel complet. Les fichiers sont produits dans le navigateur à
 * partir des données lues sur le serveur.
 */

import { useState } from 'react'
import { FileSpreadsheet, FileText, Printer, RefreshCw, Table } from 'lucide-react'

import {
  messageErreur,
  type DataQualityReport,
  type DecisionReport,
  type EngineSettings,
  type SchoolDiagnostic,
  type SimulationResult,
  type TerritorialSummary,
} from '@shared/api'
import { telechargerFichier } from '@shared/exports/export-csv'
import { exporterTableauXLSX } from '@shared/exports/export-xlsx'
import { classesDe } from '@shared/kernel'
import { Notice, Panel } from '@shared/ui/commun'

import { construireRapportDocx } from '../../application/exports/export-docx'
import { exporterClasseurComplet } from '../../application/exports/export-excel'

/** Types MIME des fichiers produits. */
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface ProprietesExportsRapport {
  rapport: DecisionReport
  scenarioNom: string
  demonstration: boolean
  /** Écoles du périmètre filtré, avec leur diagnostic. */
  ecoles: SchoolDiagnostic[]
  /** Nœud territorial courant, pour la feuille des territoires. */
  arbre: TerritorialSummary | null
  parametres: EngineSettings | null
  qualite: DataQualityReport | null
  resultat: SimulationResult | null
  comparaison: SimulationResult[]
}

/** Exporte la liste des écoles du périmètre en Excel. */
function exporterEcoles(ecoles: SchoolDiagnostic[], annee: string) {
  void exporterTableauXLSX(
    `diagnostic-ecoles-${annee}.xlsx`,
    [
      'Code',
      'Établissement',
      'Région',
      'Département',
      'Commune',
      'Classes',
      'Enseignants État',
      'Dotation D',
      'Besoin calculé',
      'Postes déclarés',
      'Excédent mobilisable',
      'Élèves',
      'Élèves par enseignant État',
    ],
    ecoles.map(d => [
      d.school.id,
      d.school.nom,
      d.school.region,
      d.school.departement,
      d.school.commune,
      classesDe(d),
      d.enseignantsEtat,
      d.enseignantsMinimumAConserver,
      d.besoinTheorique,
      d.postesDeclares,
      d.excedentTheorique,
      d.school.effectifTotalEleves,
      d.elevesParEnseignantEtat,
    ]),
  )
}

/** Panneau « Générer et exporter ». */
export function ExportsRapport(props: ProprietesExportsRapport) {
  const { rapport, scenarioNom, demonstration, ecoles, arbre, parametres, qualite, resultat, comparaison } = props
  const [exportEnCours, setExportEnCours] = useState<'word' | 'excel' | null>(null)
  const [erreurExport, setErreurExport] = useState<string | null>(null)
  const annee = rapport.anneeScolaire

  /** Exécute un export en signalant son déroulement et son éventuel échec. */
  async function exporter(type: 'word' | 'excel', produire: () => Promise<void>) {
    setExportEnCours(type)
    setErreurExport(null)
    try {
      await produire()
    } catch (erreur) {
      setErreurExport(messageErreur(erreur))
    } finally {
      setExportEnCours(null)
    }
  }

  const exporterWord = () =>
    exporter('word', async () => {
      const blob = await construireRapportDocx({ rapport, scenarioNom, donneesDemonstration: demonstration })
      telechargerFichier(blob, `rapport-affectation-${annee}.docx`, MIME_DOCX)
    })

  const exporterExcel = () =>
    exporter('excel', async () => {
      if (!arbre || !parametres) throw new Error('Les données du périmètre sont encore en cours de chargement.')
      const octets = await exporterClasseurComplet({
        ecoles,
        parametres,
        arbre,
        qualite,
        resultat,
        comparaison,
        rapport,
      })
      telechargerFichier(octets, `rapport-affectation-${annee}.xlsx`, MIME_XLSX)
    })

  return (
    <Panel
      kicker="Rapport décisionnel"
      title="Générer et exporter"
      hint="Le rapport reprend le périmètre, les filtres et le scénario actuellement sélectionnés."
      actions={
        <>
          <button type="button" className="btn" onClick={() => window.print()}>
            <Printer size={14} aria-hidden="true" /> Imprimer / PDF
          </button>
          <button type="button" className="btn" onClick={() => exporterEcoles(ecoles, annee)}>
            <Table size={14} aria-hidden="true" /> Écoles (Excel)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void exporterWord()}
            disabled={exportEnCours !== null}
          >
            {exportEnCours === 'word' ? (
              <RefreshCw size={14} className="spin" aria-hidden="true" />
            ) : (
              <FileText size={14} aria-hidden="true" />
            )}
            Rapport Word
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void exporterExcel()}
            disabled={exportEnCours !== null || !arbre || !parametres}
          >
            {exportEnCours === 'excel' ? (
              <RefreshCw size={14} className="spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet size={14} aria-hidden="true" />
            )}
            Classeur Excel complet
          </button>
        </>
      }
    >
      <p className="hint">
        Le rapport Word reprend le document ci-dessous, section par section, avec ses tableaux : il est modifiable avant
        transmission. L’impression produit la même mise en page sans navigation ni filtres, et le navigateur permet de
        l’enregistrer en PDF. Le classeur Excel contient en plus le diagnostic école par école, les agrégats
        territoriaux, les propositions avec leur justification et les contrôles.
      </p>
      {erreurExport && (
        <Notice tone="alert" title="Export impossible.">
          {erreurExport}
        </Notice>
      )}
    </Panel>
  )
}
