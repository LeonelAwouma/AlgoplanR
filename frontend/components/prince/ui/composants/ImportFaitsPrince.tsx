'use client'

/**
 * Import d'un lot de décisions depuis un classeur ou un fichier CSV, en deux temps : l'aperçu montre ce que le
 * fichier changerait aux bases (décisions acceptées, alertes, refus, avant / après) sans rien enregistrer ; la
 * validation enregistre les décisions et recalcule.
 */

import { useRef, useState } from 'react'
import { RefreshCw, Upload } from 'lucide-react'

import { messageErreur, type IdJeu } from '@shared/api'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import { useApercuImportPrince, useImporterFaitsPrince } from '../../application/hooks'
import { ResumeApplication } from './ApplicationAuxBases'

/** Nombre de refus détaillés dans le bilan. */
const REFUS_DETAILLES = 6

/** Panneau « Importer un lot de décisions ». */
export function ImportFaitsPrince({ jeu }: { jeu: IdJeu }) {
  const champFichier = useRef<HTMLInputElement>(null)
  const [fichier, setFichier] = useState<File | null>(null)
  const apercu = useApercuImportPrince(jeu)
  const importation = useImporterFaitsPrince(jeu)
  const bilan = importation.data
  const occupe = apercu.isPending || importation.isPending

  function abandonner() {
    setFichier(null)
    apercu.reset()
  }

  function valider() {
    if (!fichier) return
    importation.mutate({ fichier }, { onSuccess: abandonner })
  }

  const essai = apercu.data
  const acceptees = essai?.bilan.acceptees ?? 0
  const refus = essai?.bilan.refus ?? []

  return (
    <Panel
      kicker="Import"
      title="Importer un lot de décisions"
      hint="Une ligne par décision : matricule de l’enseignant (« id_ens » ou « Matricule_Enseignant »), école de destination (« id_etab » ou « Identifiant_Ecole ») et, facultativement, le motif ou la référence de la décision."
      actions={
        <button type="button" className="btn btn-sm" disabled={occupe} onClick={() => champFichier.current?.click()}>
          {apercu.isPending ? (
            <RefreshCw size={13} className="spin" aria-hidden="true" />
          ) : (
            <Upload size={13} aria-hidden="true" />
          )}{' '}
          {fichier ? 'Choisir un autre fichier' : 'Prévisualiser un fichier'}
        </button>
      }
    >
      <input
        ref={champFichier}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="champ-fichier-cache"
        aria-label="Fichier de décisions à importer"
        onChange={e => {
          const choisi = e.target.files?.[0]
          if (choisi) {
            importation.reset()
            setFichier(choisi)
            apercu.mutate({ fichier: choisi })
          }
          e.target.value = ''
        }}
      />

      {apercu.error && <Notice tone="alert">{messageErreur(apercu.error)}</Notice>}
      {importation.error && <Notice tone="alert">{messageErreur(importation.error)}</Notice>}

      {essai && fichier && (
        <div className="stack">
          <Notice
            tone={refus.length ? 'warn' : 'info'}
            title={`Aperçu de « ${fichier.name} » — rien n’est encore enregistré.`}
          >
            {fmt(acceptees)} décision(s) seraient enregistrées
            {refus.length > 0
              ? `, ${fmt(refus.length)} ligne(s) seraient écartée(s) : ${refus.slice(0, REFUS_DETAILLES).join(' ; ')}${refus.length > REFUS_DETAILLES ? '…' : ''}`
              : '.'}
          </Notice>

          <ResumeApplication application={essai.application} />

          <div className="action-bar">
            <p className="hint">
              Valider enregistre ces décisions, applique les faits aux bases et relance le diagnostic et les
              simulations.
            </p>
            <div className="action-bar-boutons">
              <button type="button" className="btn" disabled={occupe} onClick={abandonner}>
                Abandonner
              </button>
              <button type="button" className="btn btn-primary" disabled={occupe || acceptees === 0} onClick={valider}>
                {importation.isPending && <RefreshCw size={13} className="spin" aria-hidden="true" />} Valider et
                recalculer
              </button>
            </div>
          </div>
        </div>
      )}

      {bilan && (
        <Notice
          tone={bilan.refus.length ? 'warn' : 'info'}
          title={`${fmt(bilan.acceptees)} décision(s) enregistrée(s) ; les bases et les calculs sont à jour.`}
        >
          {bilan.refus.length > 0
            ? `${fmt(bilan.refus.length)} ligne(s) écartée(s) : ${bilan.refus.slice(0, REFUS_DETAILLES).join(' ; ')}${bilan.refus.length > REFUS_DETAILLES ? '…' : ''}`
            : 'Toutes les lignes ont été appliquées.'}
        </Notice>
      )}

      {!essai && !bilan && !apercu.error && !importation.error && (
        <p className="hint">
          Choisissez un fichier pour voir, avant toute modification, quelles décisions seraient acceptées, lesquelles
          porteraient une alerte ou seraient rejetées, et ce qu’elles changeraient.
        </p>
      )}
    </Panel>
  )
}
