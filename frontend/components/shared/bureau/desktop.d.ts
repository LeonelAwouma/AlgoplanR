/**
 * API exposée par l'application de bureau (electron-app/preload.js).
 *
 * Elle n'existe que dans la version installée : dans un navigateur ordinaire,
 * `window.algobaba` est indéfini et tout ce qui concerne les mises à jour est
 * simplement masqué.
 */

export type PhaseMiseAJour = 'inactive' | 'verification' | 'a-jour' | 'telechargement' | 'prete' | 'indisponible'

export interface EtatMiseAJour {
  phase: PhaseMiseAJour
  /** Version actuellement installée. */
  versionActuelle: string
  /** Version trouvée sur le dépôt, quand il y en a une plus récente. */
  nouvelleVersion?: string
  /** Progression du téléchargement, de 0 à 100. */
  pourcentage?: number
  /** Raison d'une désactivation (mode développement, poste sans accès extérieur). */
  motif?: string
}

export interface ApiBureau {
  /**
   * Accès au backend lancé par l'application de bureau : adresse locale (port
   * tiré au démarrage) et jeton à joindre à chaque requête. Absent tant
   * qu'Electron ne démarre pas le backend.
   */
  api?: {
    baseUrl: string
    jeton: string
  }
  /** Stockage durable sur fichier, limité aux clés prévues (registre des accès). */
  stockage: {
    lire: (cle: string) => Promise<unknown>
    ecrire: (cle: string, valeur: unknown) => Promise<boolean>
  }
  misesAJour: {
    etat: () => Promise<EtatMiseAJour>
    surChangement: (rappel: (etat: EtatMiseAJour) => void) => () => void
    installer: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    algobaba?: ApiBureau
  }
}
