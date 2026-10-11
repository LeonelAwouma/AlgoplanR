'use client'

/**
 * Actualisation de l'exercice : deux nouveaux classeurs remplacent les
 * données, sans perdre les décisions qui restent valables. Le serveur
 * rapproche les enseignants par matricule et les écoles par code, puis relance
 * tous les calculs.
 */

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { messageErreur, type FichierImporte, type IdJeu, type TypeFichier } from '@shared/api'
import { Notice, Panel } from '@shared/ui/commun'
import { ChampAuteur, useAuteur } from '@shared/ui/ChampAuteur'
import { ErreurAction } from '@shared/ui/etats'

import { useActualiserJeu, useCorrigerCorrespondances, useEnvoyerFichier } from '../../application/hooks'
import { TYPES_FICHIER, colonnesRequisesManquantes } from '../../domain/correspondances'
import { CarteFichier } from './CarteFichier'
import { TableCorrespondance } from './TableCorrespondance'

/** Panneau « Actualiser les données ». */
export function ActualisationDonnees({ jeu }: { jeu: IdJeu }) {
  const envoi = useEnvoyerFichier()
  const correction = useCorrigerCorrespondances()
  const actualisation = useActualiserJeu(jeu)
  const [auteur, setAuteur] = useAuteur()

  const [fichiers, setFichiers] = useState<Record<TypeFichier, FichierImporte | null>>({
    etablissements: null,
    enseignants: null,
  })
  const [erreurs, setErreurs] = useState<Partial<Record<TypeFichier, string>>>({})
  const [enLecture, setEnLecture] = useState<TypeFichier | null>(null)

  async function choisirFichier(type: TypeFichier, fichier: File) {
    setEnLecture(type)
    setErreurs(courantes => ({ ...courantes, [type]: undefined }))
    try {
      const lu = await envoi.mutateAsync({ type, fichier })
      setFichiers(courants => ({ ...courants, [type]: lu }))
    } catch (erreur) {
      setErreurs(courantes => ({ ...courantes, [type]: messageErreur(erreur) }))
    } finally {
      setEnLecture(null)
    }
  }

  const { etablissements, enseignants } = fichiers
  const manquantes = TYPES_FICHIER.flatMap(t => {
    const f = fichiers[t]
    return f ? colonnesRequisesManquantes(f.correspondances) : []
  })
  const pret = !!etablissements && !!enseignants && manquantes.length === 0 && auteur.trim() !== ''

  function actualiser() {
    if (!etablissements || !enseignants) return
    actualisation.mutate(
      { etablissements: etablissements.id, enseignants: enseignants.id, auteur: auteur.trim() },
      { onSuccess: () => setFichiers({ etablissements: null, enseignants: null }) },
    )
  }

  return (
    <Panel
      kicker="Actualisation"
      title="Actualiser les données de l’exercice"
      hint="Déposez les nouvelles versions des deux classeurs. Les faits du Prince, arbitrages et nominations qui restent valables sont conservés ; les autres sont signalés dans les écarts."
    >
      <div className="upload-cards">
        {TYPES_FICHIER.map(type => (
          <CarteFichier
            key={type}
            type={type}
            fichier={fichiers[type]}
            erreur={erreurs[type] ?? null}
            enLecture={enLecture === type}
            desactive={actualisation.isPending}
            onFichier={fichier => void choisirFichier(type, fichier)}
          />
        ))}
      </div>

      {manquantes.length > 0 && (
        <>
          <Notice tone="alert" title="Information indispensable manquante.">
            {manquantes.map(m => m.label).join(', ')} : indiquez la colonne correspondante avant d’actualiser.
          </Notice>
          {TYPES_FICHIER.map(type => {
            const fichier = fichiers[type]
            if (!fichier) return null
            return (
              <TableCorrespondance
                key={type}
                fichier={fichier}
                enregistrement={correction.isPending}
                onChange={(champ, enTete) =>
                  correction.mutate(
                    { fichier: fichier.id, correspondances: { [champ]: enTete } },
                    { onSuccess: misAJour => setFichiers(courants => ({ ...courants, [type]: misAJour })) },
                  )
                }
              />
            )
          })}
        </>
      )}

      <div className="param-grid">
        <ChampAuteur auteur={auteur} onChange={setAuteur} />
      </div>
      <ErreurAction erreur={actualisation.error} />
      {actualisation.isSuccess && (
        <Notice tone="info" title="Données actualisées.">
          Le diagnostic, les scénarios et la planification ont été recalculés. Les écarts sont détaillés ci-dessous.
        </Notice>
      )}
      <div className="topbar-actions actions-formulaire">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!pret || actualisation.isPending}
          onClick={actualiser}
        >
          <RefreshCw size={14} className={actualisation.isPending ? 'spin' : undefined} aria-hidden="true" /> Actualiser
          l’exercice
        </button>
      </div>
    </Panel>
  )
}
