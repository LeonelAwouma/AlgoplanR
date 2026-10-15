'use client'

/**
 * Saisie d'un code remis par le DRH : la région du délégué et le code de 8 caractères. Le code est vérifié par le
 * serveur, hors ligne, contre le catalogue signé de l'installation ; s'il est accepté, la session ne permet que de
 * créer le mot de passe personnel.
 */

import { useState, type FormEvent } from 'react'
import { KeyRound, RefreshCw } from 'lucide-react'

import { messageErreur } from '../../shared/api'
import { REGIONS_CAMEROUN } from '../../shared/kernel/regions'
import { Notice } from '../../shared/ui/commun'
import { useSaisirCode } from '../application/hooks'
import type { ReponseSession, UsageCode } from '../domain/types'

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const LONGUEUR = 8

/** Majuscules, sans espaces ni tirets, limité aux caractères des codes. */
export function normaliserCode(saisie: string): string {
  return saisie
    .toUpperCase()
    .replace(/[\s_-]/g, '')
    .split('')
    .filter(c => ALPHABET.includes(c))
    .join('')
    .slice(0, LONGUEUR)
}

/** Affichage par blocs de 4 : « ABCD-EFGH ». */
function enBlocs(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

export function FormulaireCode({
  usage,
  regionImposee,
  onAccepte,
}: {
  usage: UsageCode
  /** Région du poste, quand elle est déjà connue (récupération). */
  regionImposee?: string | null
  onAccepte: (reponse: ReponseSession, code: string) => void
}) {
  const [region, setRegion] = useState(regionImposee ?? '')
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const saisie = useSaisirCode()

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    try {
      onAccepte(await saisie.mutateAsync({ region, usage, code }), code)
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <form className="login-form" onSubmit={valider} aria-busy={saisie.isPending}>
      <div className="field">
        <label htmlFor="code-region">Votre région</label>
        <select
          id="code-region"
          value={region}
          disabled={saisie.isPending || !!regionImposee}
          onChange={e => setRegion(e.target.value)}
        >
          <option value="">Choisir la région…</option>
          {REGIONS_CAMEROUN.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="code-acces">
          {usage === 'activation' ? 'Code d’activation' : 'Code de récupération'} ({LONGUEUR} caractères)
        </label>
        <input
          id="code-acces"
          className="login-code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={saisie.isPending}
          value={enBlocs(code)}
          onChange={e => setCode(normaliserCode(e.target.value))}
          placeholder="XXXX-XXXX"
        />
      </div>
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={saisie.isPending || !region || code.length !== LONGUEUR}
      >
        {saisie.isPending ? (
          <RefreshCw size={15} className="spin" aria-hidden="true" />
        ) : (
          <KeyRound size={15} aria-hidden="true" />
        )}
        {saisie.isPending ? 'Vérification…' : 'Valider le code'}
      </button>
      <p className="hint">
        Le code vous est remis par le DRH. À l’étape suivante, vous créerez votre mot de passe personnel : le code ne
        servira plus ensuite sur ce poste.
      </p>
    </form>
  )
}
