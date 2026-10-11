/**
 * Descripteurs des routes de l'API AlgoPlanR.
 *
 * Chaque route est déclarée une seule fois, dans la couche `infrastructure` de
 * son contexte, sous la forme d'un descripteur qui porte :
 *   - la méthode HTTP et le gabarit du chemin (`jeux/{jeu}/scenarios/{scenario}/`) ;
 *   - le type de la réponse et celui du corps envoyé, vérifiés à la compilation ;
 *   - le mode d'envoi du corps (JSON ou formulaire multipart pour les fichiers).
 *
 * Les paramètres du gabarit sont extraits par le système de types : appeler une
 * route sans fournir `{ params: { jeu } }` est une erreur de compilation.
 *
 * Toutes les routes déclarées sont inscrites dans un registre, que le test de
 * couverture compare au manifeste des routes documentées.
 */

/** Méthodes HTTP utilisées par l'API. */
export type MethodeHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Mode d'envoi du corps de la requête. */
export type ModeEnvoi = 'json' | 'multipart'

/** Noms des paramètres d'un gabarit : `'jeux/{jeu}/scenarios/{scenario}/'` → `'jeu' | 'scenario'`. */
export type NomsParams<G extends string> = G extends `${string}{${infer Nom}}${infer Reste}`
  ? Nom | NomsParams<Reste>
  : never

/** Valeurs des paramètres d'un gabarit, ou `never` si le gabarit n'en a pas. */
export type ParamsRoute<G extends string> = [NomsParams<G>] extends [never]
  ? never
  : Record<NomsParams<G>, string | number>

/** Champs d'un formulaire multipart : texte ou fichier. Les valeurs `undefined` sont ignorées. */
export type ChampsMultipart = Record<string, string | Blob | undefined>

/**
 * Description d'une route. Les champs `_reponse` et `_corps` n'existent qu'au
 * niveau des types : ils transportent les types de la réponse et du corps
 * jusqu'à l'appel, sans rien coûter à l'exécution.
 */
export interface DescripteurRoute<Reponse, Gabarit extends string, Corps> {
  readonly methode: MethodeHttp
  readonly gabarit: Gabarit
  readonly envoi: ModeEnvoi
  readonly _reponse?: Reponse
  readonly _corps?: Corps
}

/** Signature réduite d'une route, telle qu'inscrite au registre. */
export interface SignatureRoute {
  methode: MethodeHttp
  gabarit: string
}

const registre: SignatureRoute[] = []

/** Routes déclarées par les modules d'infrastructure déjà chargés. */
export function routesDeclarees(): readonly SignatureRoute[] {
  return registre
}

/**
 * Déclare une route.
 *
 * L'appel se fait en deux temps pour que TypeScript infère le gabarit tout en
 * laissant la réponse et le corps explicites :
 *
 * ```ts
 * const lireJeu = route<JeuDeDonnees>()('GET', 'jeux/{jeu}/')
 * const creerJeu = route<JeuCree, CorpsCreationJeu>()('POST', 'jeux/')
 * ```
 *
 * @param envoi `multipart` pour les routes qui reçoivent un fichier.
 */
export function route<Reponse, Corps = undefined>() {
  return <Gabarit extends string>(
    methode: MethodeHttp,
    gabarit: Gabarit,
    envoi: ModeEnvoi = 'json',
  ): DescripteurRoute<Reponse, Gabarit, Corps> => {
    registre.push({ methode, gabarit })
    return { methode, gabarit, envoi }
  }
}

/**
 * Remplace les paramètres d'un gabarit par leurs valeurs encodées.
 *
 * @throws Error si un paramètre du gabarit n'a pas de valeur : c'est une erreur
 * de programmation, que le typage empêche normalement.
 */
export function construireChemin(gabarit: string, params: Record<string, string | number> = {}): string {
  return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) => {
    const valeur = params[nom]
    if (valeur === undefined || valeur === '') {
      throw new Error(`Paramètre « ${nom} » manquant pour la route ${gabarit}.`)
    }
    return encodeURIComponent(String(valeur))
  })
}
