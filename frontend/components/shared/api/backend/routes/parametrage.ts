/**
 * Routes du contexte « Paramétrage ». Seules les règles que le serveur connaît
 * lui sont transmises (voir conversions/parametres.ts).
 */

import type { EngineSettings, InventaireSituations, MiseAJourParametres } from '../../contrat'
import { versConfigDjango, versEngineSettings, type ConfigDjango } from '../conversions/parametres'
import { categorieSituation, LIBELLES_SITUATION } from '../conversions/referentiel'
import type { Conversion } from '../types'

/** Réponse du serveur à une lecture ou une modification des règles d'un jeu. */
interface ReglesJeu {
  parametres: ConfigDjango
  /** Année scolaire du jeu, enregistrée à sa création. */
  annee_scolaire?: string
}

const reglesDuJeu = (r: ReglesJeu): EngineSettings => versEngineSettings(r.parametres, r.annee_scolaire)

/** Paramètres au format du contrat (un fichier exporté par l'interface) ou déjà au format du serveur. */
function versServeur(parametres: unknown): unknown {
  const p = parametres as Partial<EngineSettings> | null
  return p && typeof p === 'object' && ('scoring' in p || 'mobilite' in p || 'besoin' in p)
    ? versConfigDjango(p as MiseAJourParametres)
    : parametres
}

export const conversionsParametrage: Record<string, Conversion> = {
  'GET parametres/defaut/': async (_, acces) =>
    versEngineSettings(await acces.lire<ConfigDjango>('parametres/defaut/')),

  'GET jeux/{jeu}/parametres/': async (_, acces, p) =>
    reglesDuJeu(await acces.lire<ReglesJeu>(`jeux/${p.jeu}/parametres/`)),

  'PUT jeux/{jeu}/parametres/': async (r, acces, p) =>
    reglesDuJeu(
      await acces.ecrire<ReglesJeu>('PUT', `jeux/${p.jeu}/parametres/`, versConfigDjango(r.corps as EngineSettings)),
    ),

  'PATCH jeux/{jeu}/parametres/': async (r, acces, p) =>
    reglesDuJeu(
      await acces.ecrire<ReglesJeu>(
        'PATCH',
        `jeux/${p.jeu}/parametres/`,
        versConfigDjango(r.corps as MiseAJourParametres),
      ),
    ),

  'POST jeux/{jeu}/parametres/import/': async (r, acces, p) => {
    const { parametres } = r.corps as { parametres: unknown }
    const reponse = await acces.ecrire<ReglesJeu>('POST', `jeux/${p.jeu}/parametres/import/`, {
      parametres: versServeur(parametres),
    })
    return reglesDuJeu(reponse)
  },

  'GET jeux/{jeu}/situations-familiales/': async (_, acces, p): Promise<InventaireSituations> => {
    const r = await acces.lire<{ situations: { valeur: string; effectif: number }[] }>(
      `jeux/${p.jeu}/situations-familiales/`,
    )
    const reconnues = new Map<string, InventaireSituations['reconnues'][number]>()
    const nonReconnues: InventaireSituations['nonReconnues'] = []
    let nonRenseignees = 0
    for (const s of r.situations) {
      if (s.valeur === '(vide)' || s.valeur.trim() === '') {
        nonRenseignees += s.effectif
        continue
      }
      const { cle, reconnue } = categorieSituation(s.valeur)
      if (!reconnue) {
        nonReconnues.push({ valeur: s.valeur, effectif: s.effectif })
        continue
      }
      const groupe = reconnues.get(cle) ?? { cle, libelle: LIBELLES_SITUATION[cle], effectif: 0, graphies: [] }
      groupe.effectif += s.effectif
      groupe.graphies.push(s.valeur)
      reconnues.set(cle, groupe)
    }
    return { reconnues: [...reconnues.values()], nonReconnues, nonRenseignees }
  },
}
