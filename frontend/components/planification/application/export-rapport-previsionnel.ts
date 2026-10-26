/**
 * Classeur Excel du rapport prévisionnel : les tableaux du rapport DRH (§3 à
 * §9) calculés sur le jeu, et les listes nominatives du volet redéploiement.
 *
 * `xlsx` est importé dynamiquement, comme pour le classeur du rapport
 * décisionnel ; la génération reste entièrement locale.
 */

import type {
  ListesRapportPrevisionnel,
  RapportPrevisionnel,
  ScenarioRecrutement,
  StatutEcoleRedeploiement,
} from '../../shared/api'
import { telechargerFichier, type CellValue } from '../../shared/exports/export-csv'
import { classeurEnOctets, type FeuilleXlsx } from '../../shared/exports/export-xlsx'
import type { IdJeu } from '../../shared/api'
import { lireListesRapport, type OptionsRapport, type RequetePlanification } from '../infrastructure/planificationApi'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const LIBELLE_SCENARIO: Record<ScenarioRecrutement, string> = {
  min: 'S-min',
  maintien: 'S-maintien',
  besoin: 'S-besoin',
  plafond: 'Sous plafond',
}

export const SCENARIOS: ScenarioRecrutement[] = ['min', 'maintien', 'besoin', 'plafond']

export const LIBELLE_STATUT_ECOLE: Record<StatutEcoleRedeploiement, string> = {
  deficit: 'Déficit',
  excedent: 'Excédent',
  equilibre: 'Équilibre',
  sans_eleves: 'Sans élèves connus',
}

export async function exporterClasseurRapportPrevisionnel(
  rapport: RapportPrevisionnel,
  listes: ListesRapportPrevisionnel,
): Promise<Uint8Array> {
  const feuilles: FeuilleXlsx[] = []
  // Mise en forme (en-têtes, filtre, formats, noms d'onglets de 31 caractères au plus) : export-xlsx.ts.
  const ajouter = (nom: string, entetes: string[], lignes: CellValue[][]) => {
    feuilles.push({ nom, entetes, lignes })
  }

  // Retraites non calculables : le texte « Non calculable » remplace toute valeur inconnue, jamais un zéro ni une case
  // vide muette (les mêmes textes que l'écran).
  const inconnu = (v: number | null, inconnue: boolean): CellValue => (v === null && inconnue ? 'Non calculable' : v)
  const n = rapport.national
  ajouter(
    'NATIONAL',
    ['Ligne', ...n.annees],
    n.lignes.map(l => [l.libelle, ...l.valeurs.map(v => inconnu(v, l.fiabilite === 'non_calculable'))]),
  )

  const ret = rapport.retraitesRegions
  ajouter(
    'RETRAITES_REGIONS',
    ['Région', ...rapport.annees, `Total ${rapport.horizon} an(s)`],
    [...ret.lignes, ret.national].map(l => [l.region, ...l.annees.map(v => inconnu(v, true)), inconnu(l.total, true)]),
  )

  const sc = rapport.scenariosRegions
  ajouter(
    'SCENARIOS_REGIONS',
    [
      'Région',
      ...SCENARIOS.map(s => LIBELLE_SCENARIO[s]),
      'Taux d’encadrement base',
      'Taux d’encadrement final S-min',
      'Taux d’encadrement final S-besoin',
      'Taux d’encadrement final plafond',
    ],
    [...sc.lignes, sc.national].map(l => [
      l.region,
      ...SCENARIOS.map(s => inconnu(l[s], sc.fiabilite?.[s] === 'non_calculable')),
      l.remBase,
      inconnu(l.remFinal.min, sc.fiabilite?.min === 'non_calculable'),
      l.remFinal.besoin,
      l.remFinal.plafond,
    ]),
  )

  const red = rapport.redeploiement
  ajouter(
    'REDEPLOIEMENT',
    [
      'Région',
      'Écoles',
      'En déficit',
      'En excédent',
      'À l’équilibre',
      'Sans élèves connus',
      'Excédents (postes)',
      'Déficits (postes)',
      'Redéployable dans l’arrondissement',
      `Cohorte ≥ ${red.seuilCohorte} ans`,
      'Retraites sur l’horizon',
    ],
    [...red.lignes, red.national].map(l => [
      l.territoire,
      l.ecoles,
      l.ecolesDeficit,
      l.ecolesExcedent,
      l.ecolesEquilibre,
      l.ecolesSansEleves,
      l.excedents,
      l.deficits,
      l.redeployableArrondissement,
      l.cohorte,
      inconnu(l.retraites, true),
    ]),
  )

  ajouter(
    'PRIORITES',
    [
      'Région',
      'Priorité',
      'Taux d’encadrement primaire base',
      'Retraites / stock (%)',
      'Priorité provisoire (retraites inconnues ou incomplètes)',
      'Situation',
      'Orientation',
      'Problèmes',
    ],
    rapport.priorites.map(f => [
      f.region,
      f.priorite,
      f.remBase,
      inconnu(f.partRetraites, true),
      f.prioriteProvisoire ? 'Oui' : 'Non',
      f.situation,
      f.orientation,
      f.problemes.map((p, i) => `${i + 1}. ${p.titre} : ${p.detail}`).join('\n'),
    ]),
  )

  ajouter(
    'ECOLES',
    [
      'Code',
      'École',
      'Région',
      'Département',
      'Commune',
      'Élèves',
      'C1 enseignants',
      'C3 nécessaires',
      'Déficit',
      'Excédent',
      'Situation',
    ],
    listes.ecoles.map(e => [
      e.idEcole,
      e.nomEcole,
      e.region,
      e.departement,
      e.commune,
      e.eleves,
      e.c1Enseignants,
      e.c3Necessaires,
      e.deficit,
      e.excedent,
      LIBELLE_STATUT_ECOLE[e.statut],
    ]),
  )

  ajouter(
    'COHORTE_5ANS',
    [
      'Matricule',
      'Nom',
      'Code école',
      'École',
      'Région',
      'Département',
      'Commune',
      'Ancienneté au poste',
      'Situation de l’école',
    ],
    listes.cohorte.map(c => [
      c.matricule,
      c.nom,
      c.idEcole,
      c.nomEcole,
      c.region,
      c.departement,
      c.commune,
      c.anciennetePoste,
      LIBELLE_STATUT_ECOLE[c.statutEcole],
    ]),
  )

  ajouter(
    'LIMITES',
    ['Limite ou point à confirmer'],
    rapport.limites.map(l => [l]),
  )

  return classeurEnOctets(feuilles)
}

/** Lit les listes nominatives du périmètre, construit le classeur et le télécharge. */
export async function telechargerRapportPrevisionnel(
  jeu: IdJeu,
  requete: RequetePlanification,
  options: OptionsRapport,
  rapport: RapportPrevisionnel,
): Promise<void> {
  const listes = await lireListesRapport(jeu, requete, options)
  const octets = await exporterClasseurRapportPrevisionnel(rapport, listes)
  telechargerFichier(octets, `rapport-previsionnel-${rapport.perimetre}.xlsx`, MIME_XLSX)
}
