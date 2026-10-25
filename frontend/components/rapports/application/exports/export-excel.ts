/**
 * Export Excel complet du diagnostic et de la simulation.
 *
 * Reprend et étend le classeur existant : les feuilles historiques
 * (affectations, non affectés, postes non pourvus, vivier) sont conservées, et
 * s'y ajoutent le diagnostic école par école, les agrégats territoriaux, la
 * qualité des données et le rapport décisionnel.
 *
 * `xlsx` est importé dynamiquement pour ne pas alourdir le chargement initial
 * de l'application ; la génération reste entièrement locale.
 */

import type {
  DataQualityReport,
  DecisionReport,
  EngineSettings,
  SchoolDiagnostic,
  SimulationResult,
  TerritorialSummary,
} from '../../../shared/api'
import {
  LIBELLE_CLASSEMENT,
  LIBELLE_ISSUE,
  LIBELLE_NATURE,
  LIBELLE_PROVENANCE_GROUPES,
  LIBELLE_PROXIMITE,
  LIBELLE_SOUS_SYSTEME,
  LIBELLE_STATUT_BESOIN,
  LIBELLE_STATUT_PROPOSITION,
  LIBELLE_STATUT_VOEU,
  LIBELLE_ZONE_SECURITE,
  ZONES_SECURITE,
  libelleZoneSecurite,
  MESSAGE_MULTIGRADES_NON_RENSEIGNES,
} from '../../../shared/kernel'
import type { CellValue } from '../../../shared/exports/export-csv'
import { classeurEnOctets, type FeuilleXlsx } from '../../../shared/exports/export-xlsx'

const SEVERITE_LABEL: Record<SchoolDiagnostic['severite'], string> = {
  excedent: 'Excédent mobilisable',
  satisfaisant: 'Situation satisfaisante',
  deficit_faible: 'Déficit faible',
  deficit_important: 'Déficit important',
  deficit_critique: 'Déficit critique',
}

export interface ExcelExportInput {
  /** Diagnostics des écoles du périmètre exporté. */
  ecoles: SchoolDiagnostic[]
  /** Règles en vigueur : points de sécurité et règle de la zone rouge. */
  parametres: EngineSettings
  arbre: TerritorialSummary
  qualite: DataQualityReport | null
  resultat: SimulationResult | null
  comparaison: SimulationResult[]
  rapport: DecisionReport | null
}

/** Aplatit l'arbre territorial en lignes région / département / commune. */
function lignesTerritoriales(arbre: TerritorialSummary): CellValue[][] {
  const lignes: CellValue[][] = []
  const visiter = (noeud: TerritorialSummary) => {
    if (noeud.territory.level !== 'national') {
      lignes.push([
        noeud.territory.level,
        noeud.territory.region ?? '',
        noeud.territory.departement ?? '',
        noeud.territory.commune ?? '',
        noeud.totals.ecolesAnalysees,
        noeud.totals.ecolesEnDeficit,
        noeud.totals.ecolesAvecExcedent,
        noeud.totals.classes ?? '',
        noeud.totals.enseignantsEtat,
        noeud.totals.postesNecessaires,
        noeud.totals.postesDeclares ?? '',
        noeud.totals.excedentMobilisable,
        noeud.totals.effectifTotalEleves ?? '',
        noeud.totals.elevesParEnseignantEtat ?? '',
      ])
    }
    for (const enfant of noeud.children) visiter(enfant)
  }
  visiter(arbre)
  return lignes
}

export async function exporterClasseurComplet(input: ExcelExportInput): Promise<Uint8Array> {
  const feuilles: FeuilleXlsx[] = []
  // Mise en forme (en-têtes, filtre, formats, noms d'onglets de 31 caractères au plus) : export-xlsx.ts.
  const ajouter = (nom: string, entetes: string[], lignes: CellValue[][]) => {
    feuilles.push({ nom, entetes, lignes })
  }

  const { ecoles: diagnostics, parametres, arbre, qualite, resultat, comparaison, rapport } = input
  const t = arbre.totals

  ajouter(
    'Synthese',
    ['Indicateur', 'Valeur'],
    [
      ['Année scolaire', parametres.anneeScolaire],
      ['Établissements analysés', t.ecolesAnalysees],
      ['Établissements en déficit', t.ecolesEnDeficit],
      ['Établissements avec excédent', t.ecolesAvecExcedent],
      ...ZONES_SECURITE.map(z => [
        `Établissements en ${LIBELLE_ZONE_SECURITE[z].toLowerCase()}`,
        diagnostics.filter(d => (d.school.zoneSecurite ?? 'verte') === z).length,
      ]),
      ['Classes ouvertes', t.classes ?? 'Non renseigné'],
      ["Enseignants payés par l'État", t.enseignantsEtat],
      ['Postes nécessaires (besoin calculé)', t.postesNecessaires],
      ['Postes officiellement déclarés', t.postesDeclares ?? 'Non renseigné'],
      ['Enseignants potentiellement redéployables', t.excedentMobilisable],
      ['Élèves', t.effectifTotalEleves ?? 'Non renseigné'],
      ['Élèves par enseignant État', t.elevesParEnseignantEtat ?? 'Non renseigné'],
      ['Postes couverts par la simulation', resultat?.postesCouverts ?? 'Aucune simulation'],
      ['Besoin résiduel', resultat?.besoinResiduel ?? 'Aucune simulation'],
      ['Statut', "Simulation d'aide à la décision — ne constitue pas une décision administrative"],
    ],
  )

  ajouter(
    'Diagnostic_Ecoles',
    [
      'Code',
      'Établissement',
      'Région',
      'Département',
      'Commune',
      'Zone',
      'Zone de sécurité',
      'Type',
      'Sous-système',
      'Salles',
      'Classes ouvertes',
      'Capacité en maîtres (BMAX)',
      'Élèves N',
      'Maîtres en poste',
      'Départs connus',
      'Maîtres retenus E',
      'Norme P',
      'Besoin selon le REM C',
      'Classes multigrades M',
      'Groupes pédagogiques G',
      'Provenance de G',
      'Minimum pédagogique m',
      'Dotation D',
      'BMAX',
      'Cible K',
      'Besoin b',
      'Excédent x',
      'Dont excédent à vérifier',
      'Surnombre a',
      'Salles manquantes s',
      'Classement',
      'Postes déclarés',
      'Écart déclaré/calculé',
      'Taux d’encadrement actuel',
      'Accessibilité α',
      'Sécurité σ',
      'Poids w',
      'Niveau de difficulté',
      'Points de besoin β',
      'Indice u',
      'Méthode',
      'Situation',
      'Fiabilité du besoin final',
      'Fourchette du besoin b',
      'Minimum pédagogique provisoire',
      'Avertissement',
    ],
    diagnostics.map(d => [
      d.school.id,
      d.school.nom,
      d.school.region,
      d.school.departement,
      d.school.commune,
      d.school.zoneBrute,
      libelleZoneSecurite(d.school.zoneSecurite),
      d.school.typeEtab,
      d.school.sousSysteme ?? '',
      d.school.nbSallesClasse ?? '',
      d.school.nombreClassesOuvertes ?? '',
      d.school.sallesRenseignees ? d.school.capaciteMaitres : 'Inconnue',
      d.calcul.eleves ?? '',
      d.calcul.enseignantsEnPoste,
      d.calcul.departsConnus,
      d.calcul.enseignantsRetenus,
      d.calcul.norme,
      d.calcul.besoinSelonRem ?? '',
      d.calcul.classesMultigradesLues ?? 'Non renseigné',
      d.calcul.groupesPedagogiques ?? '',
      d.calcul.provenanceGroupes ? LIBELLE_PROVENANCE_GROUPES[d.calcul.provenanceGroupes] : '',
      d.calcul.minimumPedagogique,
      d.calcul.dotation,
      d.calcul.bmax ?? '',
      d.calcul.cible,
      d.calcul.besoin,
      d.calcul.excedent,
      d.calcul.excedentAVerifier ?? '',
      d.calcul.surnombre,
      d.calcul.sallesManquantes,
      LIBELLE_CLASSEMENT[d.classement],
      d.postesDeclares ?? '',
      d.ecartBesoinDeclare ?? '',
      d.calcul.remActuel ?? '',
      d.priorite.pointsAccessibilite,
      d.priorite.pointsSecurite,
      d.priorite.poids,
      d.priorite.niveauDifficulte,
      d.priorite.pointsBesoin,
      d.priorite.indice,
      d.calcul.methode === 'norme_eleves' ? 'Norme élèves' : 'Repli : effectif d’élèves inconnu',
      SEVERITE_LABEL[d.severite],
      d.calcul.statutBesoin ? LIBELLE_STATUT_BESOIN[d.calcul.statutBesoin] : '',
      d.calcul.besoinMin !== undefined && d.calcul.besoinMax !== undefined && d.calcul.besoinMin !== d.calcul.besoinMax
        ? `${d.calcul.besoinMin} à ${d.calcul.besoinMax}`
        : '',
      d.calcul.minimumProvisoire === undefined ? '' : d.calcul.minimumProvisoire ? 'Oui' : 'Non',
      d.calcul.minimumProvisoire ? MESSAGE_MULTIGRADES_NON_RENSEIGNES : '',
    ]),
  )

  ajouter(
    'Zones_Securite',
    [
      'Zone de sécurité',
      'Écoles',
      'Dont zone non renseignée',
      'En déficit',
      'Postes manquants',
      'Restant après simulation',
      'Règle appliquée',
    ],
    ZONES_SECURITE.map(z => {
      const ecoles = diagnostics.filter(d => (d.school.zoneSecurite ?? 'verte') === z)
      return [
        LIBELLE_ZONE_SECURITE[z],
        ecoles.length,
        z === 'verte' ? ecoles.filter(d => d.school.zoneSecurite === null).length : 0,
        ecoles.filter(d => d.besoinTheorique > 0).length,
        ecoles.reduce((s, d) => s + d.besoinTheorique, 0),
        resultat
          ? resultat.uncoveredPosts.filter(p => (p.priorite.zoneSecurite ?? 'verte') === z).length
          : 'Aucune simulation',
        z === 'rouge'
          ? 'Aucun poste imposé ni proposé hors vœux : volontaires, primes ou recrutement'
          : 'Affectations ordinaires',
      ]
    }),
  )

  ajouter(
    'Territoires',
    [
      'Niveau',
      'Région',
      'Département',
      'Commune',
      'Écoles',
      'En déficit',
      'Avec excédent',
      'Classes',
      'Enseignants État',
      'Postes nécessaires',
      'Postes déclarés',
      'Excédent mobilisable',
      'Élèves',
      'Élèves/enseignant État',
    ],
    lignesTerritoriales(arbre),
  )

  if (qualite) {
    ajouter(
      'Qualite_Donnees',
      ['Type', 'Problème', 'Nombre', 'Conséquence', 'Exemples', 'Points retirés'],
      [
        ...qualite.errors.map(
          e => ['Erreur', e.label, e.count, e.consequence, e.exemples.join(', '), -e.penalite] as CellValue[],
        ),
        ...qualite.warnings.map(
          w => ['Avertissement', w.label, w.count, w.consequence, w.exemples.join(', '), -w.penalite] as CellValue[],
        ),
        ...qualite.missingFields.map(
          f =>
            [
              f.bloquant ? 'Colonne requise absente' : 'Colonne absente',
              f.label,
              '',
              f.consequence,
              '',
              f.bloquant ? -12 : 0,
            ] as CellValue[],
        ),
        ['Score', `${qualite.score} / 100 (${qualite.appreciation})`, '', '', '', ''],
      ],
    )
  }

  if (resultat) {
    ajouter(
      'Plan_Individualise',
      [
        'Matricule',
        'Nom',
        'Prénom',
        'Sous-système',
        "École d'origine",
        'Commune origine',
        'Affectation proposée',
        'Commune',
        'Département',
        'Région',
        'Nature du mouvement',
        'Vœu satisfait',
        'Statut',
        'Année prévue',
        'Étape',
        'Périmètre',
        'Score',
      ],
      resultat.assignments.map(a => [
        a.teacherId,
        a.nomEns,
        a.prenomEns,
        a.sousSysteme ?? '',
        a.nomEtabOrigine,
        a.communeOrigine,
        a.nomEtabDestination,
        a.communeDestination,
        a.departementDestination,
        a.regionDestination,
        LIBELLE_NATURE[a.nature],
        a.rangVoeu ?? '',
        LIBELLE_STATUT_PROPOSITION[a.statut],
        a.annee,
        a.phase,
        LIBELLE_PROXIMITE[a.niveauProximite],
        a.score,
      ]),
    )

    ajouter(
      'Synthese_Voeux',
      [
        'Rang',
        'Matricule',
        'Nom',
        'Prénom',
        "École d'attache",
        'Excédent',
        'Ancienneté poste',
        'Recevable',
        'Motifs',
        'A',
        'Z',
        'Vœu 1',
        'S vœu 1',
        'Vœu 2',
        'S vœu 2',
        'Vœu 3',
        'S vœu 3',
        'Issue',
        'Détail',
      ],
      [...resultat.candidatures]
        .sort((a, b) => a.rangClassement - b.rangClassement)
        .map(c => [
          c.rangClassement,
          c.teacher.id,
          c.teacher.nom,
          c.teacher.prenom,
          c.ecoleOrigine.nom,
          c.ecoleOrigine.excedent,
          c.teacher.anciennetePosteAns,
          c.recevable ? 'Oui' : 'Non',
          c.motifsIrrecevabilite.join(' ; '),
          c.pointsAnciennete,
          c.pointsZoneDifficile,
          ...[0, 1, 2].flatMap(i => {
            const v = c.voeux[i]
            return v
              ? [`${v.nomEtab} (${LIBELLE_STATUT_VOEU[v.statut]})`, v.statut === 'examine' ? v.score : '']
              : ['', '']
          }),
          LIBELLE_ISSUE[c.issue],
          c.detailIssue,
        ]),
    )

    ajouter(
      'Postes_Classes',
      [
        'Rang',
        'Poste',
        'Code',
        'Établissement ou structure',
        'Commune',
        'Département',
        'Région',
        'Sous-système',
        'Poids w',
        'Niveau',
        'β',
        'Indice u',
        'Zone de sécurité',
        'Pourvu',
      ],
      resultat.postes.map(p => [
        p.rang,
        p.id,
        p.schoolId,
        p.nomEtab,
        p.commune,
        p.departement,
        p.region,
        p.sousSysteme ?? '',
        p.priorite.poids,
        p.priorite.niveauDifficulte,
        p.priorite.pointsBesoin,
        p.priorite.indice,
        libelleZoneSecurite(p.priorite.zoneSecurite),
        p.pourvu ? 'Oui' : 'Non',
      ]),
    )

    ajouter(
      'Synthese_Sous_Systemes',
      [
        'Moment',
        'Sous-système',
        'Besoin B',
        'Excédent X',
        'Couvrable C',
        'Restant R',
        'Salles manquantes',
        'Effectif E',
        'Recrutement à prévoir',
        'Taux de déséquilibre des dotations',
        'Degré d’aléa (1 − R²)',
      ],
      (['avant', 'apres'] as const).flatMap(moment => {
        const s = moment === 'avant' ? resultat.syntheseAvant : resultat.syntheseApres
        return [
          ...s.parSousSysteme.map(
            g =>
              [
                moment === 'avant' ? 'Avant le plan' : 'Après le plan',
                LIBELLE_SOUS_SYSTEME[g.sousSysteme],
                g.besoin,
                g.excedent,
                g.couvrable,
                g.restant,
                g.sallesManquantes,
                g.effectif,
                g.recrutementAPrevoir,
                '',
                '',
              ] as CellValue[],
          ),
          [
            moment === 'avant' ? 'Avant le plan' : 'Après le plan',
            'Total',
            s.besoin,
            s.excedent,
            s.couvrable,
            s.restant,
            s.sallesManquantes,
            '',
            s.recrutementAPrevoir,
            s.tauxDesequilibre ?? '',
            s.degreAlea ?? '',
          ] as CellValue[],
        ]
      }),
    )

    const rouges = resultat.uncoveredPosts.filter(p => p.priorite.zoneRouge)
    if (rouges.length > 0) {
      ajouter(
        'Postes_Zone_Rouge',
        [
          'Poste',
          'Code',
          'Établissement',
          'Commune',
          'Département',
          'Région',
          'Sous-système',
          'Indice u',
          'Traitement',
        ],
        rouges.map(p => [
          p.id,
          p.schoolId,
          p.nomEtab,
          p.commune,
          p.departement,
          p.region,
          p.sousSysteme ?? '',
          p.priorite.indice,
          'Volontariat, primes de zone difficile ou recrutement',
        ]),
      )
    }

    // Journal d'audit : chaque décision et chaque proposition, horodatées, avec leur statut.
    const journal: CellValue[][] = []
    for (const { fait } of resultat.faitsPrince.filter(e => e.statut !== 'rejete')) {
      journal.push([
        fait.decideLe,
        'Fait de Prince',
        fait.teacherId,
        fait.enseignant,
        fait.origine.nom,
        fait.destination.nom,
        'Décision de la DRH',
        fait.reference || '—',
      ])
    }
    for (const { decision: d, appliquee, motif } of resultat.arbitrages) {
      journal.push([
        d.decideLe,
        `Commission ${d.instance === 'centrale' ? 'centrale' : 'régionale'}`,
        d.teacherId,
        d.nomEnseignant,
        d.propositionInitiale?.nomEtab ?? '',
        d.nomEtabDestination ?? d.propositionInitiale?.nomEtab ?? '',
        `${d.decision}${appliquee ? '' : ` (non appliquée : ${motif})`}`,
        d.motif,
      ])
    }
    for (const a of resultat.assignments) {
      journal.push([
        resultat.computedAt,
        a.phase,
        a.teacherId,
        `${a.nomEns} ${a.prenomEns}`.trim(),
        a.nomEtabOrigine,
        a.nomEtabDestination,
        LIBELLE_STATUT_PROPOSITION[a.statut],
        `${LIBELLE_NATURE[a.nature]}${a.rangVoeu ? ` (vœu ${a.rangVoeu})` : ''}`,
      ])
    }
    for (const c of resultat.candidatures.filter(x => x.issue === 'irrecevable' || x.issue === 'depart_non_valide')) {
      journal.push([
        resultat.computedAt,
        'Recevabilité',
        c.teacher.id,
        `${c.teacher.nom} ${c.teacher.prenom}`.trim(),
        c.ecoleOrigine.nom,
        '',
        'Rejeté',
        c.detailIssue,
      ])
    }
    ajouter(
      'Journal_Audit',
      ['Horodatage', 'Étape', 'Matricule', 'Enseignant', 'Origine', 'Destination', 'Statut', 'Motif'],
      journal,
    )

    if (resultat.combinaisons.length > 0) {
      ajouter(
        'Combinaisons_Commission',
        ['École non couverte', 'Indice u', 'Type', 'Proposition'],
        resultat.combinaisons.map(c => [c.nomEtab, c.indicePriorite, c.type, c.description]),
      )
    }

    if (resultat.projectionsN2.length > 0) {
      ajouter(
        'Projection_N2',
        ['Matricule', 'Enseignant', "École d'attache", 'Poste projeté en N+2', 'Vœu'],
        resultat.projectionsN2.map(p => [
          p.teacherId,
          p.nom,
          p.nomEtabOrigine,
          p.nomEtab ?? 'Aucune solution prévisible',
          p.rangVoeu ?? '',
        ]),
      )
    }

    if (resultat.recrutes) {
      ajouter(
        'Nouveaux_Recrutes',
        ['Candidat', 'Nom', 'Note', 'Poste', 'Commune', 'Issue'],
        [
          ...resultat.recrutes.affectations.map(
            a =>
              [
                a.recrueId,
                a.nom,
                a.note,
                a.nomEtab,
                a.commune,
                a.issue === 'choix'
                  ? `Choix ${a.rangChoix}`
                  : a.issue === 'departement'
                    ? 'Extension au département'
                    : 'Extension à la région',
              ] as CellValue[],
          ),
          ...resultat.recrutes.vivierNational.map(
            v => [v.recrueId, v.nom, v.note, '', '', `Vivier national — ${v.motif}`] as CellValue[],
          ),
        ],
      )
    }

    if (resultat.arbitrages.length > 0) {
      ajouter(
        'Arbitrages',
        [
          'Enseignant',
          'Matricule',
          'Proposition initiale',
          'Décision',
          'École retenue',
          'Changement de sous-système',
          'Instance',
          'Motif',
          'Date',
          'Appliquée',
        ],
        resultat.arbitrages.map(({ decision: d, appliquee, motif }) => [
          d.nomEnseignant,
          d.teacherId,
          d.propositionInitiale?.nomEtab ?? '',
          d.decision,
          d.nomEtabDestination ?? '',
          d.changementSousSysteme ? 'Oui' : 'Non',
          d.instance === 'centrale' ? 'Centrale' : 'Régionale',
          d.motif,
          new Date(d.decideLe).toLocaleDateString('fr-FR'),
          appliquee ? 'Oui' : `Non — ${motif}`,
        ]),
      )
    }

    ajouter(
      'Justification_Affectations',
      ['Poste', 'Matricule', 'Composante du score', 'Valeur', 'Poids', 'Contribution'],
      resultat.assignments.flatMap(a =>
        a.breakdown.components.map(
          c => [a.postId, a.teacherId, c.label, c.valeur, c.poids, c.contribution] as CellValue[],
        ),
      ),
    )

    ajouter(
      'Vivier_Mobilisable',
      [
        'Matricule',
        'Nom',
        'Prénom',
        'École origine',
        'Commune',
        'Département',
        'Excédent de l’école',
        'Rang dans l’école',
        'Ancienneté poste',
        'Âge',
        'Barème',
        'Affecté',
      ],
      resultat.pool.teachers.map(p => [
        p.teacher.id,
        p.teacher.nom,
        p.teacher.prenom,
        p.ecoleOrigine.nom,
        p.teacher.communeAttache,
        p.teacher.departementAttache,
        p.ecoleOrigine.excedentMobilisable,
        p.rangDansEcole,
        p.teacher.anciennetePosteAns,
        p.teacher.age == null ? '' : Math.floor(p.teacher.age),
        p.bareme,
        p.affecte ? 'Oui' : 'Non',
      ]),
    )

    ajouter(
      'Ecoles_Sources',
      ['Code', 'Établissement', 'Région', 'Département', 'Commune', 'Excédent mobilisable', 'Candidats retenus'],
      resultat.pool.ecolesSources.map(e => [
        e.schoolId,
        e.nomEtab,
        e.region,
        e.departement,
        e.commune,
        e.excedentMobilisable,
        e.candidatsRetenus,
      ]),
    )

    ajouter(
      'Non_Affectes',
      ['Matricule', 'Nom', 'Prénom', 'École origine', 'Commune', 'Département', 'Barème'],
      resultat.unmatchedTeachers.map(p => [
        p.teacher.id,
        p.teacher.nom,
        p.teacher.prenom,
        p.ecoleOrigine.nom,
        p.teacher.communeAttache,
        p.teacher.departementAttache,
        p.bareme,
      ]),
    )

    ajouter(
      'Postes_Non_Pourvus',
      [
        'Poste',
        'Code établissement',
        'Établissement',
        'Commune',
        'Département',
        'Région',
        'Zone',
        'Zone de sécurité',
        'Classes multigrades',
      ],
      resultat.uncoveredPosts.map(p => [
        p.id,
        p.schoolId,
        p.nomEtab,
        p.commune,
        p.departement,
        p.region,
        p.zone,
        libelleZoneSecurite(p.priorite.zoneSecurite),
        p.classesMultigrades,
      ]),
    )

    ajouter(
      'Avant_Apres',
      ['Indicateur', 'Avant', 'Après', 'Variation'],
      [
        [
          'Établissements en déficit',
          resultat.before.ecolesEnDeficit,
          resultat.after.ecolesEnDeficit,
          resultat.after.ecolesEnDeficit - resultat.before.ecolesEnDeficit,
        ],
        [
          'Postes vacants',
          resultat.before.postesVacants,
          resultat.after.postesVacants,
          resultat.after.postesVacants - resultat.before.postesVacants,
        ],
        [
          'Déficit total',
          resultat.before.deficitTotal,
          resultat.after.deficitTotal,
          resultat.after.deficitTotal - resultat.before.deficitTotal,
        ],
        [
          'Pression moyenne élèves/enseignant État',
          resultat.before.pressionMoyenne ?? 'Non renseigné',
          resultat.after.pressionMoyenne ?? 'Non renseigné',
          '',
        ],
      ],
    )

    ajouter(
      'Controles',
      ['Contrôle', 'Résultat', 'Détail'],
      resultat.invariants.map(i => [i.label, i.ok ? 'Conforme' : 'Non conforme', i.detail]),
    )

    ajouter(
      'Journal_Simulation',
      ['Étape', 'Message', 'Valeur'],
      resultat.logs.map(l => [l.etape, l.message, l.valeur ?? '']),
    )
  }

  const decisionsPrince = (resultat?.faitsPrince ?? []).filter(
    e => e.statut === 'applique' || e.statut === 'applique_avec_alerte',
  )
  if (decisionsPrince.length > 0) {
    ajouter(
      'Fait_De_Prince',
      [
        'Matricule',
        'Enseignant',
        'École de référence',
        'Commune de l’école de référence',
        'Destination décidée',
        'Commune de la destination',
        'Pris en compte le',
        'Référence',
      ],
      decisionsPrince.map(({ fait }) => [
        fait.teacherId,
        fait.enseignant,
        fait.origine.nom,
        fait.origine.commune,
        fait.destination.nom,
        fait.destination.commune,
        fait.decideLe ? new Date(fait.decideLe).toLocaleDateString('fr-FR') : '',
        fait.reference,
      ]),
    )
  }

  if (comparaison.length > 0) {
    ajouter(
      'Comparaison_Scenarios',
      ['Indicateur', ...comparaison.map(c => c.scenarioNom)],
      [
        ['Postes nécessaires', ...comparaison.map(c => c.besoinInitial)],
        ['Postes couverts', ...comparaison.map(c => c.postesCouverts)],
        ['Enseignants déplacés', ...comparaison.map(c => c.enseignantsDeplaces)],
        ['Écoles bénéficiaires', ...comparaison.map(c => c.ecolesBeneficiaires)],
        ['Écoles sources', ...comparaison.map(c => c.ecolesSources)],
        ['Besoin résiduel', ...comparaison.map(c => c.besoinResiduel)],
        ['Taux de couverture', ...comparaison.map(c => Math.round(c.tauxCouverture * 100) / 100)],
      ],
    )
  }

  if (rapport) {
    const lignes: CellValue[][] = []
    for (const section of rapport.sections) {
      lignes.push([section.titre, ''])
      for (const p of section.paragraphes) lignes.push(['', p])
      for (const p of section.points ?? []) lignes.push(['', `• ${p}`])
      lignes.push(['', ''])
    }
    ajouter('Rapport_Decisionnel', ['Section', 'Contenu'], lignes)
  }

  return classeurEnOctets(feuilles)
}
