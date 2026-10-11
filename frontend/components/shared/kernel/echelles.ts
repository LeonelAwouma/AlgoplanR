/**
 * Calculs d'échelles pour les graphiques : graduations et classes de
 * distribution. Fonctions pures, sans dépendance à React ni au navigateur, donc
 * directement testables — ce sont elles qui garantissent qu'aucune barre ne
 * sort de son cadre et qu'aucun intervalle n'est illisible.
 */

/**
 * Graduations « rondes » couvrant 0 → max.
 *
 * Le dernier tick est toujours supérieur ou égal à `max` : sans cette garantie,
 * une valeur située entre l'avant-dernière et la dernière graduation dépasse la
 * zone de tracé et recouvre ce qui l'entoure.
 */
export function graduations(max: number, cible = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const brut = max / cible
  const magnitude = 10 ** Math.floor(Math.log10(brut))
  const normalise = brut / magnitude
  const pas = (normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 5 ? 5 : 10) * magnitude
  const sommet = Math.ceil(max / pas) * pas

  const ticks: number[] = []
  for (let v = 0; v <= sommet + pas * 0.001; v += pas) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks.length === 1) ticks.push(pas)
  return ticks
}

/** Un intervalle d'histogramme et son effectif. */
export interface ClasseHistogramme {
  /** Libellé de l'intervalle, ex. « 0,8 – 1,0 ». */
  label: string
  effectif: number
  /** Borne basse, conservée pour l'ordre et le positionnement d'un repère. */
  borneBasse: number
}

function formater(valeur: number, decimales: number): string {
  return valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/**
 * Répartit une série de valeurs en intervalles d'amplitude régulière et ronde.
 *
 * Le nombre de décimales des bornes suit l'amplitude : sur une série de taux
 * d'encadrement comprise entre 0 et 1,5, des bornes arrondies à l'unité
 * produiraient six intervalles tous étiquetés « 1 – 1 ».
 */
export function construireClasses(valeurs: number[], nbClasses = 8): ClasseHistogramme[] {
  const utiles = valeurs.filter(v => Number.isFinite(v))
  if (utiles.length === 0) return []

  const min = Math.min(...utiles)
  const max = Math.max(...utiles)
  if (max === min) {
    return [{ label: formater(min, Number.isInteger(min) ? 0 : 1), effectif: utiles.length, borneBasse: min }]
  }

  const amplitudeBrute = (max - min) / nbClasses
  const magnitude = 10 ** Math.floor(Math.log10(amplitudeBrute))
  const normalise = amplitudeBrute / magnitude
  const amplitude = (normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 5 ? 5 : 10) * magnitude
  const debut = Math.floor(min / amplitude) * amplitude
  const decimales = amplitude >= 1 ? 0 : amplitude >= 0.1 ? 1 : 2

  const classes: ClasseHistogramme[] = []
  for (let borne = debut; borne < max + amplitude * 0.5; borne += amplitude) {
    classes.push({
      label: `${formater(borne, decimales)} – ${formater(borne + amplitude, decimales)}`,
      effectif: 0,
      borneBasse: borne,
    })
  }

  for (const v of utiles) {
    const index = Math.min(classes.length - 1, Math.max(0, Math.floor((v - debut) / amplitude)))
    classes[index].effectif++
  }

  return classes
}
