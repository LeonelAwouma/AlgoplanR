/**
 * Registre des accès : règles de gestion, sans interface ni stockage.
 *
 * Toutes les fonctions sont pures : elles reçoivent un registre et en renvoient
 * un nouveau. Le stockage (fichier local de l'application de bureau) et
 * l'affichage sont ailleurs, ce qui permet de tester ces règles seules.
 *
 * Les secrets — mot de passe du DRH, codes des délégués — ne sont jamais
 * conservés en clair : seule une empreinte PBKDF2-SHA-256 salée l'est. Le code
 * d'un délégué n'est montré qu'une fois, au moment où le DRH le génère.
 */

import type { CodeAcces, DemandeEntree, RegistreAcces, ResultatEntree, SecretHache, StatutEntree } from './types'
import { REGIONS_CAMEROUN, type RegionCameroun } from '../../shared/kernel/regions'

export const REGISTRE_VIDE: RegistreAcces = { version: 1, drh: null, codes: [], demandes: [], echecs: {} }

/** Longueur minimale du mot de passe du DRH. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8
/** Au-delà de ce nombre d'essais infructueux, la région est bloquée un moment. */
export const ESSAIS_AVANT_BLOCAGE = 5
export const DUREE_BLOCAGE_MS = 5 * 60 * 1000

const ITERATIONS = 120_000
/** Alphabet sans caractères ambigus (0/O, 1/I/L) : le code se dicte au téléphone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const enHexa = (octets: Uint8Array): string => Array.from(octets, o => o.toString(16).padStart(2, '0')).join('')
const depuisHexa = (hexa: string): Uint8Array => new Uint8Array((hexa.match(/../g) ?? []).map(h => parseInt(h, 16)))

/** Un code se saisit sans tenir compte de la casse, des espaces ni des tirets. */
export function normaliserCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function deriver(secret: string, sel: Uint8Array): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(sel).buffer, iterations: ITERATIONS },
    cle,
    256,
  )
  return enHexa(new Uint8Array(bits))
}

export async function hacher(secret: string): Promise<SecretHache> {
  const sel = crypto.getRandomValues(new Uint8Array(16))
  return { sel: enHexa(sel), empreinte: await deriver(secret, sel) }
}

export async function verifierSecret(secret: string, hache: SecretHache): Promise<boolean> {
  const calcule = await deriver(secret, depuisHexa(hache.sel))
  // Comparaison sans sortie anticipée, pour ne rien laisser deviner par le temps de réponse.
  let ecart = calcule.length ^ hache.empreinte.length
  for (let i = 0; i < calcule.length; i++) ecart |= calcule.charCodeAt(i) ^ (hache.empreinte.charCodeAt(i) || 0)
  return ecart === 0
}

function identifiant(prefixe: string): string {
  return `${prefixe}-${enHexa(crypto.getRandomValues(new Uint8Array(6)))}`
}

/** Code lisible de huit caractères, présenté par groupes de quatre : « K7MQ-X2PD ». */
export function genererCode(): string {
  const tirage = crypto.getRandomValues(new Uint8Array(8))
  const lettres = Array.from(tirage, o => ALPHABET[o % ALPHABET.length]).join('')
  return `${lettres.slice(0, 4)}-${lettres.slice(4)}`
}

// --- DRH -----------------------------------------------------------------------

/** Première utilisation : le DRH choisit son mot de passe. Impossible une fois défini. */
export async function initialiserDrh(registre: RegistreAcces, motDePasse: string): Promise<RegistreAcces> {
  if (registre.drh) throw new Error('Le compte du DRH existe déjà.')
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new Error(`Le mot de passe doit compter au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`)
  }
  return { ...registre, drh: await hacher(motDePasse) }
}

export async function verifierDrh(registre: RegistreAcces, motDePasse: string): Promise<boolean> {
  return registre.drh ? verifierSecret(motDePasse, registre.drh) : false
}

// --- Codes des délégués ------------------------------------------------------------

/** Code actuellement valable pour une région, s'il y en a un. */
export function codeActif(registre: RegistreAcces, region: RegionCameroun): CodeAcces | null {
  return registre.codes.find(c => c.region === region && c.revoqueLe === null) ?? null
}

/**
 * Le DRH attribue un code à une région. Le code précédent de cette région est
 * retiré, avec les entrées qu'il avait permises : un délégué remplacé ne garde
 * aucun accès. Le code en clair n'est renvoyé qu'ici, pour être transmis.
 */
export async function attribuerCode(
  registre: RegistreAcces,
  region: RegionCameroun,
  titulaire: string,
  maintenant: Date = new Date(),
): Promise<{ registre: RegistreAcces; codeEnClair: string }> {
  if (!REGIONS_CAMEROUN.includes(region)) throw new Error('Région inconnue.')
  const nom = titulaire.trim()
  if (!nom) throw new Error('Indiquez le nom du délégué régional.')

  const codeEnClair = genererCode()
  const nouveau: CodeAcces = {
    id: identifiant('code'),
    region,
    titulaire: nom,
    secret: await hacher(normaliserCode(codeEnClair)),
    creeLe: maintenant.toISOString(),
    revoqueLe: null,
  }
  const retire = retirerCodesDeRegion(registre, region, maintenant)
  const { [region]: _oublie, ...echecs } = retire.echecs
  return { registre: { ...retire, codes: [...retire.codes, nouveau], echecs }, codeEnClair }
}

function retirerCodesDeRegion(registre: RegistreAcces, region: RegionCameroun, maintenant: Date): RegistreAcces {
  const retires = new Set(registre.codes.filter(c => c.region === region && c.revoqueLe === null).map(c => c.id))
  if (retires.size === 0) return registre
  return {
    ...registre,
    codes: registre.codes.map(c => (retires.has(c.id) ? { ...c, revoqueLe: maintenant.toISOString() } : c)),
    demandes: registre.demandes.filter(d => !retires.has(d.codeId)),
  }
}

/** Le DRH retire l'accès d'une région : le code et l'entrée validée cessent de valoir. */
export function retirerAcces(
  registre: RegistreAcces,
  region: RegionCameroun,
  maintenant: Date = new Date(),
): RegistreAcces {
  return retirerCodesDeRegion(registre, region, maintenant)
}

// --- Entrée d'un délégué -------------------------------------------------------------

/** Temps restant avant de pouvoir réessayer, 0 si la région n'est pas bloquée. */
export function blocageRestantMs(
  registre: RegistreAcces,
  region: RegionCameroun,
  maintenant: Date = new Date(),
): number {
  const e = registre.echecs[region]
  if (!e || e.nombre < ESSAIS_AVANT_BLOCAGE) return 0
  return Math.max(0, new Date(e.dernierLe).getTime() + DUREE_BLOCAGE_MS - maintenant.getTime())
}

/**
 * Un délégué saisit sa région et son code. Un code exact ne suffit pas à entrer :
 * il ouvre une demande « en attente », que seul le DRH peut valider. Le message
 * de refus est le même que la région n'ait pas de code ou que le code soit faux,
 * pour ne rien apprendre à qui essaie au hasard.
 */
export async function demanderEntree(
  registre: RegistreAcces,
  region: RegionCameroun,
  code: string,
  maintenant: Date = new Date(),
): Promise<{ registre: RegistreAcces; resultat: ResultatEntree }> {
  const restant = blocageRestantMs(registre, region, maintenant)
  if (restant > 0) {
    const minutes = Math.ceil(restant / 60_000)
    return {
      registre,
      resultat: {
        type: 'refus',
        motif: `Trop d'essais infructueux pour cette région. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      },
    }
  }

  const actif = codeActif(registre, region)
  const saisi = normaliserCode(code)
  const exact = actif !== null && saisi.length > 0 && (await verifierSecret(saisi, actif.secret))
  if (!actif || !exact) {
    const precedent = registre.echecs[region]
    // Passé le délai de blocage, le compteur repart de zéro.
    const expire = precedent && maintenant.getTime() - new Date(precedent.dernierLe).getTime() > DUREE_BLOCAGE_MS
    const nombre = (precedent && !expire ? precedent.nombre : 0) + 1
    return {
      registre: {
        ...registre,
        echecs: { ...registre.echecs, [region]: { nombre, dernierLe: maintenant.toISOString() } },
      },
      resultat: { type: 'refus', motif: 'Région ou code d’accès incorrect.' },
    }
  }

  const { [region]: _oublie, ...echecs } = registre.echecs
  const existante = registre.demandes.find(d => d.codeId === actif.id)
  if (existante) return { registre: { ...registre, echecs }, resultat: { type: existante.statut, demande: existante } }

  const demande: DemandeEntree = {
    id: identifiant('entree'),
    codeId: actif.id,
    region,
    titulaire: actif.titulaire,
    statut: 'attente',
    demandeLe: maintenant.toISOString(),
    decideLe: null,
  }
  return {
    registre: { ...registre, echecs, demandes: [...registre.demandes, demande] },
    resultat: { type: 'attente', demande },
  }
}

/** Le DRH valide ou refuse une entrée. Une décision peut être revue à tout moment. */
export function deciderEntree(
  registre: RegistreAcces,
  demandeId: string,
  statut: Exclude<StatutEntree, 'attente'>,
  maintenant: Date = new Date(),
): RegistreAcces {
  if (!registre.demandes.some(d => d.id === demandeId)) throw new Error('Demande introuvable.')
  return {
    ...registre,
    demandes: registre.demandes.map(d =>
      d.id === demandeId ? { ...d, statut, decideLe: maintenant.toISOString() } : d,
    ),
  }
}

/** Demandes que le DRH doit encore trancher, les plus anciennes d'abord. */
export function demandesEnAttente(registre: RegistreAcces): DemandeEntree[] {
  return registre.demandes.filter(d => d.statut === 'attente').sort((a, b) => a.demandeLe.localeCompare(b.demandeLe))
}

/** Vérifie qu'un contenu relu depuis le disque a bien la forme d'un registre. */
export function estRegistre(valeur: unknown): valeur is RegistreAcces {
  if (typeof valeur !== 'object' || valeur === null) return false
  const r = valeur as Partial<RegistreAcces>
  return (
    r.version === 1 &&
    Array.isArray(r.codes) &&
    Array.isArray(r.demandes) &&
    typeof r.echecs === 'object' &&
    r.echecs !== null
  )
}
