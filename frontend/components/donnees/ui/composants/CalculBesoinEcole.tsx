'use client'

/**
 * Détail du calcul du besoin d'une école (référentiel §2.2 à §2.4), dans
 * l'ordre du référentiel. Les valeurs viennent du serveur ; ce composant ne
 * fait que les présenter avec leur définition.
 */

import type { SchoolDiagnostic } from '@shared/api'
import {
  LIBELLE_CLASSEMENT,
  LIBELLE_PROVENANCE_GROUPES,
  LIBELLE_SOUS_SYSTEME,
  LIBELLE_STATUT_BESOIN,
  MESSAGE_MULTIGRADES_NON_RENSEIGNES,
} from '@shared/kernel'
import { Notice, Panel, Pill, fmt, fmtDec, fmtPct, type Tone } from '@shared/ui/commun'

/** Ton de la pastille de classement. */
const TON_CLASSEMENT: Record<SchoolDiagnostic['classement'], Tone> = {
  necessiteuse: 'alert',
  excedentaire: 'info',
  a_examiner: 'warn',
  equilibree: 'ok',
}

/** Ton de la pastille de fiabilité du besoin. */
const TON_STATUT: Record<NonNullable<SchoolDiagnostic['calcul']['statutBesoin']>, Tone> = {
  confirme: 'ok',
  estime: 'info',
  provisoire: 'warn',
}

/** Classes multigrades telles que le fichier les donne, en mots. */
function multigrades(c: SchoolDiagnostic['calcul']): string {
  switch (c.statutMultigrades) {
    case 'renseigne':
    case 'historique_non':
      return fmt(c.classesMultigradesLues ?? 0)
    case 'historique_oui':
      return 'Oui (nombre non précisé)'
    case 'invalide':
      return 'Valeur illisible (signalée)'
    case 'incoherent':
      return `${fmt(c.classesMultigradesLues ?? null)} (incohérent avec six années : signalé)`
    default:
      return 'Non renseigné'
  }
}

/** Une ligne « grandeur — valeur ». */
function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="situation-line">
      <span>{libelle}</span>
      <strong>{valeur}</strong>
    </div>
  )
}

export interface ProprietesCalculBesoinEcole {
  diagnostic: SchoolDiagnostic
  /** Norme d'encadrement en vigueur (élèves par maître), `null` tant qu'elle n'est pas connue. */
  elevesParMaitre: number | null
}

/** Panneau « Situation » de la fiche école. */
export function CalculBesoinEcole({ diagnostic: d, elevesParMaitre }: ProprietesCalculBesoinEcole) {
  const { calcul, priorite } = d
  const norme = elevesParMaitre ?? '…'

  return (
    <Panel kicker="Diagnostic" title="Situation">
      <p className="pastilles">
        <Pill tone={TON_CLASSEMENT[d.classement]}>{LIBELLE_CLASSEMENT[d.classement]}</Pill>{' '}
        {d.school.sousSysteme && <Pill>{LIBELLE_SOUS_SYSTEME[d.school.sousSysteme]}</Pill>}{' '}
        {calcul.statutBesoin && (
          <Pill tone={TON_STATUT[calcul.statutBesoin]}>{LIBELLE_STATUT_BESOIN[calcul.statutBesoin]}</Pill>
        )}
      </p>

      {calcul.minimumProvisoire && (
        <Notice tone="warn" title="Besoin provisoire.">
          {MESSAGE_MULTIGRADES_NON_RENSEIGNES}
        </Notice>
      )}
      <div className="situation-block">
        <Ligne libelle="N — élèves attendus" valeur={calcul.eleves == null ? 'Non renseigné' : fmt(calcul.eleves)} />
        <Ligne
          libelle={`E — maîtres retenus à la rentrée (${fmt(calcul.enseignantsEnPoste)} en poste − ${fmt(calcul.departsConnus)} départ(s) connu(s))`}
          valeur={fmt(calcul.enseignantsRetenus)}
        />
        <Ligne
          libelle={`P — maîtres selon la norme${
            calcul.methode === 'norme_eleves'
              ? ` (max(1 ; ⌈(N − tolérance) ÷ ${norme}⌉))`
              : ' (effectif d’élèves inconnu : un seul poste compté)'
          }`}
          valeur={fmt(calcul.norme)}
        />
        {calcul.besoinSelonRem !== undefined && (
          <Ligne
            libelle={`C — enseignants nécessaires selon le REM de référence (⌈N ÷ ${norme}⌉, indicatif)`}
            valeur={calcul.besoinSelonRem == null ? 'Non calculable (effectif inconnu)' : fmt(calcul.besoinSelonRem)}
          />
        )}
        {calcul.statutMultigrades !== undefined && (
          <Ligne libelle="Classes multigrades (fichier)" valeur={multigrades(calcul)} />
        )}
        {calcul.groupesPedagogiques !== undefined && (
          <Ligne
            libelle={`G — groupes pédagogiques${calcul.provenanceGroupes ? ` : ${LIBELLE_PROVENANCE_GROUPES[calcul.provenanceGroupes].toLowerCase()}` : ''}`}
            valeur={fmt(calcul.groupesPedagogiques)}
          />
        )}
        <Ligne
          libelle={
            calcul.groupesPedagogiques !== undefined ? 'm — minimum pédagogique, max(3 ; G)' : 'm — minimum pédagogique'
          }
          valeur={fmt(calcul.minimumPedagogique)}
        />
        <Ligne libelle="D — dotation théorique, max(P ; m)" valeur={fmt(calcul.dotation)} />
        <Ligne
          libelle="BMAX — maîtres affectables selon les salles"
          valeur={calcul.bmax == null ? 'Salles non renseignées' : fmt(calcul.bmax)}
        />
        <Ligne libelle="K — cible, min(D ; BMAX)" valeur={fmt(calcul.cible)} />
        <Ligne libelle="b — besoin en maîtres" valeur={fmt(calcul.besoin)} />
        <Ligne libelle="x — excédent théorique" valeur={fmt(calcul.excedent)} />
        {!!calcul.excedentAVerifier && (
          <Ligne
            libelle="dont excédent à vérifier (dépend d’une hypothèse sur les groupes : aucune sortie automatique)"
            valeur={fmt(calcul.excedentAVerifier)}
          />
        )}
        <Ligne libelle="a — surnombre lié aux salles" valeur={fmt(calcul.surnombre)} />
        <Ligne libelle="s — salles manquantes" valeur={fmt(calcul.sallesManquantes)} />
        <Ligne
          libelle={`Poids du poste Up = wp + βp (vulnérabilité ${fmtDec(priorite.poids)} pour accessibilité ${fmt(priorite.pointsAccessibilite)} et sécurité ${fmt(priorite.pointsSecurite)} ; besoin ${fmt(priorite.pointsBesoin)}), niveau de difficulté ${priorite.niveauDifficulte}`}
          valeur={fmtDec(priorite.indice)}
        />
      </div>

      {calcul.bmaxIncertain && (
        <p className="hint">
          Le fichier ne précise pas si les salles fonctionnent en simple ou en double flux : BMAX compte le total des
          salles en simple flux.
        </p>
      )}

      {calcul.statutBesoin === 'estime' && !calcul.minimumProvisoire && (
        <p className="hint">
          Minimum pédagogique estimé : chaque classe multigrade est supposée réunir deux années d’études, sans
          chevauchement. À confirmer si l’organisation réelle de l’école diffère.
        </p>
      )}

      {d.ecartBesoinDeclare != null && d.ecartBesoinDeclare !== 0 && (
        <Notice tone="neutral" title="Écart avec la déclaration.">
          {fmt(d.postesDeclares)} poste(s) déclaré(s) dans le fichier source pour {fmt(d.besoinTheorique)} poste(s)
          calculé(s). Les deux valeurs sont conservées telles quelles.
        </Notice>
      )}

      {d.pressionPedagogique != null && (
        <p className="hint">
          Taux d’encadrement actuel : {fmtPct(d.pressionPedagogique)} de la norme ({norme} élèves par enseignant).
        </p>
      )}
    </Panel>
  )
}
