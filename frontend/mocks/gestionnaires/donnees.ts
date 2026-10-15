/**
 * Données factices — jeu de données, classeurs, validation, actualisations et
 * règles du moteur.
 *
 * Tout import, quels que soient les fichiers envoyés, ouvre le jeu de
 * démonstration : les données factices ne lisent pas les classeurs.
 */

import { http } from 'msw'

import type {
  CorpsValidationJeu,
  EngineSettings,
  JeuCree,
  MiseAJourParametres,
  Sante,
  TypeFichier,
} from '../../components/shared/api'

import { auditer, etat, maintenant } from '../etat'
import { introuvable, nonSimule, ok, refus, sansContenu } from '../reponses'
import { api, corps, jeuConnu } from './outils'

/** Fusion récursive d'une mise à jour partielle ; les tableaux sont remplacés. */
function fusionner<T>(base: T, maj: unknown): T {
  if (maj === null || typeof maj !== 'object' || Array.isArray(maj)) return (maj ?? base) as T
  const resultat: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [cle, valeur] of Object.entries(maj)) {
    resultat[cle] = fusionner(resultat[cle], valeur)
  }
  return resultat as T
}

/** Ouvre (ou rouvre) le jeu de démonstration. */
function ouvrirJeu() {
  const e = etat()
  e.jeuSupprime = false
  auditer('import', 'création', 'Ouverture du jeu de démonstration', null, { type: 'jeu', id: e.jeu.id })
  const reponse: JeuCree = { jeu: e.jeu, qualite: e.qualite }
  return ok(reponse, false, 201)
}

/** Les règles ont changé : les calculs ne sont pas refaits, la planification le signale. */
function reglesModifiees(parametres: EngineSettings, auteur: string | null) {
  const e = etat()
  const avant = e.parametres
  e.parametres = parametres
  e.etatPlanification = { ...e.etatPlanification, obsolete: true }
  auditer('parametres', 'modification', 'Modification des règles du moteur', auteur, null, avant, parametres)
  return ok(parametres)
}

export const gestionnairesDonnees = [
  // --- Système ---------------------------------------------------------------------
  http.get(api('sante/'), () => {
    const sante: Sante = { statut: 'ok', version: 'données factices' }
    return ok(sante)
  }),

  // --- Classeurs et jeux -----------------------------------------------------------
  http.post(api('fichiers/'), async ({ request }) => {
    const formulaire = await request.formData()
    const type = formulaire.get('type') as TypeFichier | null
    if (type !== 'etablissements' && type !== 'enseignants') return refus('Nature de fichier inconnue.')
    return ok(etat().fichiers[type], false, 201)
  }),
  http.patch(api('fichiers/:fichier/correspondances/'), ({ params }) => {
    const fichier = Object.values(etat().fichiers).find(f => f.id === params.fichier)
    return fichier ? ok(fichier) : introuvable('Ce fichier n’a pas été envoyé.')
  }),

  http.get(api('jeux/'), () => ok(etat().jeuSupprime ? [] : [etat().jeu])),
  http.post(api('jeux/'), () => ouvrirJeu()),
  http.post(api('jeux/demonstration/'), () => ouvrirJeu()),
  http.get(api('jeux/:jeu/'), ({ params }) => (jeuConnu(params.jeu) ? ok(etat().jeu) : introuvable())),
  http.delete(api('jeux/:jeu/'), ({ params }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    etat().jeuSupprime = true
    return sansContenu()
  }),

  // --- Validation et actualisations ----------------------------------------------------
  http.get(api('jeux/:jeu/validation/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().validation) : introuvable(),
  ),
  http.post(api('jeux/:jeu/validation/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const { auteur } = await corps<CorpsValidationJeu>(request)
    const e = etat()
    const bloquants = e.validation.controles.filter(c => c.bloquant && !c.ok)
    if (bloquants.length > 0) return refus(`Validation impossible : ${bloquants.map(c => c.libelle).join(', ')}.`)
    e.validation = { ...e.validation, statut: 'valide', valideLe: maintenant(), validePar: auteur }
    e.jeu = { ...e.jeu, statut: 'valide' }
    auditer('validation_donnees', 'validé', 'Jeu validé comme référence des projections', auteur, {
      type: 'jeu',
      id: e.jeu.id,
    })
    return ok(e.validation)
  }),
  http.get(api('jeux/:jeu/actualisations/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().actualisations) : introuvable(),
  ),
  http.post(api('jeux/:jeu/actualisations/'), () => nonSimule('L’actualisation des données')),

  // --- Règles du moteur ------------------------------------------------------------------
  http.get(api('jeux/:jeu/parametres/'), ({ params }) =>
    jeuConnu(params.jeu) ? ok(etat().parametres) : introuvable(),
  ),
  http.put(api('jeux/:jeu/parametres/'), async ({ params, request }) =>
    jeuConnu(params.jeu) ? reglesModifiees(await corps<EngineSettings>(request), null) : introuvable(),
  ),
  http.patch(api('jeux/:jeu/parametres/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const maj = await corps<MiseAJourParametres>(request)
    return reglesModifiees(fusionner(etat().parametres, maj), null)
  }),
  http.post(api('jeux/:jeu/parametres/import/'), async ({ params, request }) => {
    if (!jeuConnu(params.jeu)) return introuvable()
    const { parametres } = await corps<{ parametres: unknown }>(request)
    if (parametres === null || typeof parametres !== 'object') return refus('Le fichier ne contient pas de règles.')
    return reglesModifiees(fusionner(etat().parametres, parametres), null)
  }),
]
