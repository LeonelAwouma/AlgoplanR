'use client'

/**
 * Dépôt d'un fichier signé par l'administration AlgoPlanR : activation du poste du DRH, récupération de son mot de
 * passe, ou nouveau catalogue de codes. La signature est vérifiée par le serveur avec la clé publique embarquée ;
 * aucun fichier n'expire.
 */

import { useState, type FormEvent } from 'react'
import { FileKey, RefreshCw } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { Notice } from '../../shared/ui/commun'
import { useActiverPoste } from '../application/hooks'
import type { ActivationAppliquee } from '../domain/types'

export function FormulaireFichier({
  libelle,
  onApplique,
}: {
  libelle: string
  onApplique: (resultat: ActivationAppliquee) => void
}) {
  const [fichier, setFichier] = useState<File | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const activation = useActiverPoste()

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (!fichier) return
    setErreur(null)
    try {
      onApplique(await activation.mutateAsync(fichier))
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <form className="login-form" onSubmit={valider} aria-busy={activation.isPending}>
      <label className="upload-drop">
        <FileKey size={22} aria-hidden="true" />
        <span>{fichier ? fichier.name : 'Choisir le fichier (.algoplanr-activation ou .algoplanr-catalogue)'}</span>
        <input
          type="file"
          accept=".algoplanr-activation,.algoplanr-catalogue,.json"
          disabled={activation.isPending}
          onChange={e => setFichier(e.target.files?.[0] ?? null)}
        />
      </label>
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={!fichier || activation.isPending}>
        {activation.isPending && <RefreshCw size={15} className="spin" aria-hidden="true" />}
        {libelle}
      </button>
    </form>
  )
}
