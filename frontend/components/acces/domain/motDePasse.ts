/**
 * Règles d'un nouveau mot de passe, affichées pendant la saisie.
 *
 * Elles reprennent celles du serveur (backend/domaine/acces/mots_de_passe.py),
 * qui seul décide : l'interface les montre pour guider la saisie, puis affiche
 * tels quels les refus du serveur.
 */

export const LONGUEUR_MIN = 10

const TRIVIAUX = new Set([
  '123456',
  '1234567890',
  'azerty1234',
  'motdepasse1',
  'password12',
  'algoplanr1',
  'cameroun2026',
])

export interface RegleMotDePasse {
  libelle: string
  ok: boolean
}

export function reglesMotDePasse(nouveau: string, confirmation: string, identifiant: string): RegleMotDePasse[] {
  const ident = identifiant.trim().toLowerCase()
  const bas = nouveau.toLowerCase()
  return [
    { libelle: `Au moins ${LONGUEUR_MIN} caractères`, ok: nouveau.length >= LONGUEUR_MIN },
    { libelle: 'Au moins une lettre', ok: /\p{L}/u.test(nouveau) },
    { libelle: 'Au moins un chiffre', ok: /\d/.test(nouveau) },
    {
      libelle: 'Ne reprend pas l’identifiant',
      ok: nouveau.length > 0 && !(ident && (bas.includes(ident) || ident.includes(bas))),
    },
    {
      libelle: 'N’est ni le mot de passe temporaire ni un mot de passe trop simple',
      ok: nouveau.length > 0 && !TRIVIAUX.has(bas) && new Set(nouveau).size >= 4,
    },
    { libelle: 'Les deux saisies sont identiques', ok: nouveau.length > 0 && nouveau === confirmation },
  ]
}

export function motDePasseAcceptable(nouveau: string, confirmation: string, identifiant: string): boolean {
  return reglesMotDePasse(nouveau, confirmation, identifiant).every(r => r.ok)
}
