'use client'

/**
 * Écran de bienvenue, affiché au lancement par-dessus l'application.
 *
 * Il ne porte aucun état métier : l'application reste montée derrière lui, si
 * bien que l'ouvrir puis le refermer ne perd ni le jeu ouvert, ni les filtres,
 * ni un import en cours. « Commencer » mène au tableau de bord quand un jeu
 * est chargé, sinon à « Données de référence » ; aucun calcul n'est lancé.
 */

import Image from 'next/image'
import { motion, type Variants } from 'motion/react'
import { ArrowRight, BarChart3, FileText, FlaskConical, RefreshCw, ShieldCheck, Upload } from 'lucide-react'

import { useCreerJeuDemonstration, useJeu } from '@components/donnees'
import { MENTION_SIMULATION } from '@shared/kernel'
import { useSession } from '@shared/session'
import { CameroonFlagRail } from '@shared/ui/coquille/CameroonFlagRail'
import { ErreurAction } from '@shared/ui/etats'

import { FeatureCard } from './FeatureCard'

const FONCTIONS = [
  {
    Icone: Upload,
    titre: 'Collecter',
    description:
      'Importation des fichiers Excel des établissements et des enseignants, reconnaissance des colonnes et contrôle qualité.',
  },
  {
    Icone: BarChart3,
    titre: 'Analyser',
    description: 'Diagnostic des besoins, indicateurs territoriaux, écoles prioritaires et exploration cartographique.',
  },
  {
    Icone: FlaskConical,
    titre: 'Simuler',
    description: 'Scénarios d’affectation, redéploiement, vœux, arbitrage et projections.',
  },
  {
    Icone: FileText,
    titre: 'Restituer',
    description: 'Comparaison des scénarios, indicateurs de décision et génération des rapports.',
  },
] as const

const DOUCE = [0.22, 1, 0.36, 1] as const

/** Entrée d'un bloc : fondu et translation verticale, avec un délai. */
const entree = (delai: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: DOUCE, delay: delai },
})

/** Grille des cartes : révèle ses enfants l'un après l'autre. */
const GRILLE: Variants = {
  cache: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } },
}

export function WelcomePage() {
  const { jeu, setPage, fermerAccueil, ouvrirJeu } = useSession()
  const meta = useJeu(jeu)
  const demonstration = useCreerJeuDemonstration()
  const donneesChargees = !!meta.data

  function commencer() {
    setPage(donneesChargees ? 'overview' : 'import')
    fermerAccueil()
  }

  function explorerDemonstration() {
    demonstration.mutate(undefined, {
      onSuccess: cree => {
        ouvrirJeu(cree.jeu.id)
        fermerAccueil()
      },
    })
  }

  return (
    <motion.div
      className="bienvenue"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bienvenue-titre"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.28, ease: DOUCE } }}
      transition={{ duration: 0.3 }}
    >
      <CameroonFlagRail variante="accueil" />

      <div className="bienvenue-defilement">
        <div className="bienvenue-cadre">
          <motion.header className="bienvenue-entete" {...entree(0)}>
            <Image className="bienvenue-embleme" src="/logo-mark.png" alt="" width={64} height={38} priority />
            <span>
              <span className="bienvenue-nom">ALGOPLANR</span>
              <span className="bienvenue-mention">Planification et affectation des enseignants</span>
            </span>
          </motion.header>

          <main className="bienvenue-principal">
            <div className="bienvenue-texte">
              <motion.h1 id="bienvenue-titre" {...entree(0.08)}>
                Bienvenue dans AlgoPlanR
              </motion.h1>
              <motion.p className="bienvenue-sous-titre" {...entree(0.16)}>
                Une solution d’analyse, de planification et d’aide à la décision pour une meilleure répartition des
                enseignants au Cameroun.
              </motion.p>
              <motion.p className="bienvenue-presentation" {...entree(0.24)}>
                Les données restent sur ce poste et sont traitées localement. Chaque résultat se rattache aux règles qui
                l’ont produit, consultables à tout moment : relancée avec les mêmes données et les mêmes règles, une
                simulation donne le même résultat.
              </motion.p>

              <motion.div className="bienvenue-actions" {...entree(0.55)}>
                <button type="button" className="btn btn-primary bienvenue-commencer" onClick={commencer} autoFocus>
                  Commencer <ArrowRight size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={explorerDemonstration}
                  disabled={demonstration.isPending}
                >
                  {demonstration.isPending && <RefreshCw size={15} className="spin" aria-hidden="true" />}
                  Explorer une démonstration
                </button>
              </motion.div>
              <motion.p className="hint bienvenue-reprise" {...entree(0.6)}>
                {donneesChargees
                  ? `Un jeu de données est ouvert (${meta.data?.anneeScolaire ?? ''}) : « Commencer » reprend le tableau de bord.`
                  : 'Pour commencer, ajoutez le fichier des établissements et celui des enseignants.'}
              </motion.p>
              <ErreurAction erreur={demonstration.error} />
            </div>

            <motion.div
              className="bienvenue-logo"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: DOUCE, delay: 0.1 }}
            >
              <Image src="/logo-full.png" alt="Logo AlgoPlanR" width={640} height={424} priority />
            </motion.div>
          </main>

          <motion.section
            className="bienvenue-cartes"
            aria-label="Fonctions de la plateforme"
            variants={GRILLE}
            initial="cache"
            animate="visible"
          >
            {FONCTIONS.map(fonction => (
              <FeatureCard key={fonction.titre} {...fonction} />
            ))}
          </motion.section>

          <motion.footer className="bienvenue-pied" {...entree(0.75)}>
            <p>
              <ShieldCheck size={15} aria-hidden="true" /> Traitement local : aucune connexion Internet n’est
              nécessaire.
            </p>
            <p>{MENTION_SIMULATION}</p>
          </motion.footer>
        </div>
      </div>
    </motion.div>
  )
}
