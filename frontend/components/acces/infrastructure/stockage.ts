/**
 * Conservation du registre des accès.
 *
 * Dans l'application de bureau, le registre est un fichier du dossier de données
 * de l'utilisateur, écrit par le processus principal : il survit aux
 * redémarrages et aux mises à jour. Dans un navigateur (développement), il
 * retombe sur le stockage local de la page.
 *
 * Le registre ne contient aucune donnée d'établissement ni d'enseignant :
 * seulement des empreintes de secrets, des noms de délégués et des décisions.
 */

import type { RegistreAcces } from '../domain/types'
import { REGISTRE_VIDE, estRegistre } from '../domain/registre'

const CLE = 'acces'
const CLE_NAVIGATEUR = 'algobaba.acces'

export async function chargerRegistre(): Promise<RegistreAcces> {
  try {
    const bureau = typeof window !== 'undefined' ? window.algobaba?.stockage : undefined
    const brut: unknown = bureau
      ? await bureau.lire(CLE)
      : JSON.parse(window.localStorage.getItem(CLE_NAVIGATEUR) ?? 'null')
    return estRegistre(brut) ? brut : REGISTRE_VIDE
  } catch {
    return REGISTRE_VIDE
  }
}

export async function enregistrerRegistre(registre: RegistreAcces): Promise<void> {
  const bureau = typeof window !== 'undefined' ? window.algobaba?.stockage : undefined
  if (bureau) {
    // Une décision qui n'a pas pu être écrite ne doit pas paraître acquise à l'écran.
    if (!(await bureau.ecrire(CLE, registre)))
      throw new Error("Le registre des accès n'a pas pu être enregistré sur ce poste.")
    return
  }
  window.localStorage.setItem(CLE_NAVIGATEUR, JSON.stringify(registre))
}
