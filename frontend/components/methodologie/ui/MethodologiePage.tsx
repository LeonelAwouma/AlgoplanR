'use client'

/**
 * Page Méthodologie (§22) : compréhensible sans connaissance technique, avec
 * les formules disponibles mais au second plan. Le contenu est statique ; seules
 * les valeurs des règles viennent du serveur.
 */

import { BookOpen, Download, Printer } from 'lucide-react'

import { MENTION_SIMULATION } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel } from '@shared/ui/commun'
import { useParametres, useParametresDefaut } from '@components/parametrage'

import { downloadMethodologyDocx } from '../application/export-methodologie-docx'
import { NOTIONS, REGLES_MOTEUR, VOCABULAIRE } from '../domain/methodologie'
import { ParametrageApplique } from './composants/ParametrageApplique'

/** Page « Méthodologie ». */
export function MethodologiePage() {
  const { jeu } = useSession()
  const parametresJeu = useParametres(jeu)
  const parametresDefaut = useParametresDefaut()
  const parametres = parametresJeu.data ?? parametresDefaut.data

  return (
    <div className="stack">
      <Panel
        kicker="Référentiel de calcul"
        title="Comment les chiffres sont obtenus"
        hint="Cette page explique, sans supposer de connaissances techniques, ce que signifie chaque indicateur et comment il est calculé."
        actions={
          <>
            <button type="button" className="btn" onClick={() => window.print()}>
              <Printer size={14} aria-hidden="true" /> Imprimer
            </button>
            <button type="button" className="btn" onClick={() => void downloadMethodologyDocx()}>
              <Download size={14} aria-hidden="true" /> Télécharger (Word)
            </button>
          </>
        }
      >
        <Notice tone="info" title="Statut des résultats.">
          {MENTION_SIMULATION}
        </Notice>
      </Panel>

      <Panel kicker="Notions" title="Les notions, une par une">
        <div className="stack">
          {NOTIONS.map(notion => (
            <article key={notion.titre} className="notion">
              <h3 className="notion-titre">{notion.titre}</h3>
              <p className="texte-courant">{notion.explication}</p>
              {notion.parametrable && (
                <p className="hint texte-mesure">
                  <strong>Paramétrable :</strong> {notion.parametrable}
                </p>
              )}
              {notion.formule && (
                <details className="advanced">
                  <summary>Voir la formule exacte</summary>
                  <pre className="code">{notion.formule}</pre>
                </details>
              )}
            </article>
          ))}
        </div>
      </Panel>

      {parametres && <ParametrageApplique parametres={parametres} parDefaut={!parametresJeu.data} />}

      <Panel kicker="Pour aller plus loin" title="Règles exactes appliquées par le moteur">
        <ul className="reason-list">
          {REGLES_MOTEUR.map(regle => (
            <li key={regle.titre} className="bloc">
              <strong className="regle-titre">{regle.titre}</strong>
              <span className="regle-texte">{regle.texte}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel kicker="Vocabulaire" title="Termes techniques et leurs équivalents">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Terme technique (Vue analyste)</th>
              <th>Formulation employée en Vue simplifiée</th>
            </tr>
          </thead>
          <tbody>
            {VOCABULAIRE.map(v => (
              <tr key={v.technique}>
                <th scope="row">{v.technique}</th>
                <td>{v.simplifie}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel kicker="Fonctionnement" title="Traitement local et absence d’IA">
        <p className="texte-courant">
          <BookOpen size={15} aria-hidden="true" /> Les classeurs sont analysés par le serveur AlgoPlanR installé sur le
          poste de l’utilisateur, qui exécute les calculs et conserve les données ; la carte s’appuie sur un fichier
          géographique embarqué, et les exports sont générés localement. Aucune donnée d’établissement, d’enseignant ou
          d’élève ne quitte la machine, et aucune intelligence artificielle générative n’intervient dans l’analyse : les
          textes de diagnostic proviennent de modèles de phrases déclenchés par des conditions sur les valeurs
          calculées.
        </p>
      </Panel>
    </div>
  )
}
