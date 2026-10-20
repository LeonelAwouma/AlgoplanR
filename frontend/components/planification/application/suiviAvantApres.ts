/**
 * Indicateurs de suivi « avant / après » : REM (élèves par enseignant) et degré d'aléa.
 *
 * Avant : les bases telles qu'importées (effectifs déclarés, avant les faits du Prince et avant l'algorithme).
 * Après : les bases après le recalcul (faits du Prince et mouvements du scénario). Fonction pure : le serveur calcule,
 * l'interface met côte à côte et ne recalcule rien.
 */

import type { ComparaisonEncadrement, DegreAlea } from '@shared/api'

export interface LigneSuivi {
  territoire: string
  national: boolean
  remAvant: number | null
  remApres: number | null
  aleaAvant: number | null
  aleaApres: number | null
  /** Pourquoi un aléa n'est pas calculable (moins de 3 écoles avec élèves…), `null` quand il l'est. */
  raisonAleaAvant: string | null
  raisonAleaApres: string | null
}

export interface SuiviAvantApres {
  lignes: LigneSuivi[]
  /** Les deux sources sont-elles disponibles ? Sinon la colonne manquante reste vide, avec la raison. */
  remDisponible: boolean
  aleaDisponible: boolean
}

const cle = (nom: string) => nom.trim().toLowerCase()

/** Écart après − avant, arrondi au centième ; `null` si l'une des deux valeurs manque. */
export function ecart(avant: number | null, apres: number | null): number | null {
  return avant === null || apres === null ? null : Math.round((apres - avant) * 100) / 100
}

/** Met côte à côte REM et aléa, avant et après, pour le national puis chaque région. */
export function construireSuiviAvantApres(
  encadrement: ComparaisonEncadrement | null | undefined,
  alea: DegreAlea | null | undefined,
): SuiviAvantApres {
  const regions = new Map<string, LigneSuivi>()
  const national: LigneSuivi = {
    territoire: 'National',
    national: true,
    remAvant: encadrement?.national.remAvant ?? null,
    remApres: encadrement?.national.remApres ?? null,
    aleaAvant: alea?.avant?.national.alea ?? null,
    aleaApres: alea?.national.alea ?? null,
    raisonAleaAvant: alea?.avant?.national.raison ?? null,
    raisonAleaApres: alea?.national.raison ?? null,
  }
  const ligne = (nom: string): LigneSuivi => {
    const k = cle(nom)
    let l = regions.get(k)
    if (!l) {
      l = {
        territoire: nom,
        national: false,
        remAvant: null,
        remApres: null,
        aleaAvant: null,
        aleaApres: null,
        raisonAleaAvant: null,
        raisonAleaApres: null,
      }
      regions.set(k, l)
    }
    return l
  }
  for (const r of encadrement?.parRegion ?? []) {
    const l = ligne(r.territoire)
    l.remAvant = r.remAvant
    l.remApres = r.remApres
  }
  for (const r of alea?.regions ?? []) {
    const l = ligne(r.region)
    l.aleaApres = r.alea
    l.raisonAleaApres = r.raison
  }
  for (const r of alea?.avant?.regions ?? []) {
    const l = ligne(r.region)
    l.aleaAvant = r.alea
    l.raisonAleaAvant = r.raison
  }
  const triees = [...regions.values()].sort((a, b) => a.territoire.localeCompare(b.territoire, 'fr'))
  return {
    lignes: [national, ...triees],
    remDisponible: Boolean(encadrement),
    aleaDisponible: Boolean(alea?.avant),
  }
}
