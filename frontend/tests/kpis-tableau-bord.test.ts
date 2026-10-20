/**
 * Indicateurs du tableau de bord : REM national en somme sur somme, taux d'attrition étiqueté comme hypothèse,
 * degré d'aléa du serveur, et « — » quand une donnée manque.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  construireKpis,
  attritionAffichee,
  recrutementsNecessaires,
  type EntreeKpis,
} from '../components/diagnostic/application/kpis'
import type { SchoolDiagnostic, TerritorialTotals } from '../components/shared/api'
import { agregerTotaux } from '../components/shared/api/backend/moteur/diagnostic'

/** École minimale : seuls les champs lus par l'agrégation sont renseignés. */
function ecole(enseignants: number, eleves: number | null, classes: number | null): SchoolDiagnostic {
  return {
    enseignantsEtat: enseignants,
    besoinTheorique: 0,
    excedentTheorique: 0,
    postesDeclares: null,
    enseignantsMobilisables: 0,
    classement: 'normal',
    calcul: { sallesManquantes: 0, surnombre: 0 },
    school: {
      nbAutresEnseignants: null,
      effectifTotalEleves: eleves,
      classesMultigrades: 0,
      nombreClassesOuvertes: classes,
    },
  } as unknown as SchoolDiagnostic
}

const TOTAUX: TerritorialTotals = {
  ecolesAnalysees: 120,
  ecolesEnDeficit: 30,
  ecolesAvecExcedent: 20,
  ecolesSatisfaisantes: 70,
  classes: 600,
  enseignantsEtat: 500,
  autresEnseignants: null,
  postesNecessaires: 80,
  postesDeclares: null,
  excedentMobilisable: 45,
  sallesManquantes: 0,
  surnombre: 0,
  ecolesAExaminer: 0,
  effectifTotalEleves: 25000,
  elevesParEnseignantEtat: 50,
  elevesParClasse: 41.7,
  classesMultigrades: 0,
}

function entree(patch: Partial<EntreeKpis> = {}): EntreeKpis {
  return { totals: TOTAUX, ecolesDuJeu: 120, resultat: null, hypotheses: null, alea: null, anneePlan: null, ...patch }
}

const cle = (kpis: ReturnType<typeof construireKpis>, c: string) =>
  [...kpis.principaux, ...kpis.secondaires].find(k => k.cle === c)!

describe('REM national', () => {
  it('somme des élèves ÷ somme des enseignants, non moyenne des REM des écoles', () => {
    // REM des écoles : 100 et 10 (moyenne 55) ; REM national : 1 010 ÷ 11 = 91,8.
    const t = agregerTotaux([ecole(10, 1000, 10), ecole(1, 10, 1)])
    assert.equal(t.elevesParEnseignantEtat, 91.82)
  })

  it('ne compte pas les enseignants des écoles dont l’effectif d’élèves est inconnu', () => {
    // Sans cette règle : 600 ÷ 40 = 15 ; les 30 enseignants de l’école sans effectif ne doivent pas diluer le REM.
    const t = agregerTotaux([ecole(10, 600, 10), ecole(30, null, 30)])
    assert.equal(t.elevesParEnseignantEtat, 60)
    assert.equal(t.elevesParClasse, 60)
    assert.equal(t.enseignantsEtat, 40, 'l’effectif total d’enseignants reste complet')
  })

  it('est indisponible quand aucune école n’a d’effectif d’élèves', () => {
    const t = agregerTotaux([ecole(10, null, 10)])
    assert.equal(t.elevesParEnseignantEtat, null)
  })
})

describe('indicateurs du tableau de bord', () => {
  it('affiche « — » pour ce qui dépend d’un scénario tant qu’il n’y en a pas', () => {
    const kpis = construireKpis(entree())
    for (const c of ['affectations', 'alea', 'restants', 'couverture', 'recrutements']) {
      assert.equal(cle(kpis, c).valeur, '—', c)
      assert.equal(cle(kpis, c).disponible, false, c)
    }
  })

  it('présente sept indicateurs d’emblée et quatre autres dessous', () => {
    const kpis = construireKpis(entree())
    assert.equal(kpis.principaux.length, 7)
    assert.equal(kpis.secondaires.length, 4)
  })

  it('indique la situation à laquelle chaque indicateur se rapporte', () => {
    const kpis = construireKpis(entree())
    assert.equal(cle(kpis, 'necessiteuses').etape, 'effective')
    assert.equal(cle(kpis, 'restants').etape, 'simulation')
    assert.equal(cle(kpis, 'attrition').etape, 'hypothese')
  })

  it('reprend le degré d’aléa calculé par le serveur et explique son absence', () => {
    const national = {
      region: 'National',
      alea: 0.67,
      raison: null,
      ecoles: 120,
      ecolesAvecEleves: 110,
      ecartNational: null,
    }
    assert.equal(cle(construireKpis(entree({ alea: { national } })), 'alea').valeur, '0,67')
    assert.equal(cle(construireKpis(entree({ alea: { national } })), 'alea').cible, 'alea')

    const absent = { ...national, alea: null, raison: 'Moins de 3 écoles avec un effectif d’élèves connu' }
    const kpi = cle(construireKpis(entree({ alea: { national: absent } })), 'alea')
    assert.equal(kpi.valeur, '—')
    assert.match(kpi.hint, /Moins de 3 écoles/)
  })

  it('prend le quota retenu de N+1, à défaut le quota calculé', () => {
    assert.equal(recrutementsNecessaires({ quotaCalcule: 900, quotaRetenu: 850, besoinRestant: 0 }), 850)
    assert.equal(recrutementsNecessaires({ quotaCalcule: 900, quotaRetenu: null, besoinRestant: 0 }), 900)
    assert.equal(recrutementsNecessaires(null), null)
  })
})

describe('taux d’attrition', () => {
  const base = { source: '', justification: '', niveauArrondi: 'region' as const, parSousSysteme: {}, parRegion: {} }

  it('un taux unique est une valeur, présentée comme hypothèse', () => {
    const a = attritionAffichee({ attrition: { ...base, methode: 'taux_unique', tauxUnique: 2.5 } })
    assert.deepEqual(a, { valeur: '2,5 %', methode: 'taux unique' })
    const kpi = cle(
      construireKpis(entree({ hypotheses: { attrition: { ...base, methode: 'taux_unique', tauxUnique: 2.5 } } })),
      'attrition',
    )
    assert.match(kpi.hint, /Hypothèse annuelle/)
  })

  it('des taux régionaux donnent une fourchette', () => {
    const a = attritionAffichee({
      attrition: { ...base, methode: 'par_region', tauxUnique: 2, parRegion: { Centre: 1.5, Nord: 3 } },
    })
    assert.equal(a.valeur, '1,5 à 3,0 %')
    assert.equal(a.methode, 'par région')
  })

  it('est indisponible sans hypothèses', () => {
    assert.equal(attritionAffichee(null).valeur, '—')
  })
})
