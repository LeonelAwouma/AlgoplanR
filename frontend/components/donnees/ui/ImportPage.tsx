'use client'

/**
 * Import des données, en une seule action.
 *
 * L'utilisateur dépose ses deux classeurs ; le serveur les lit et reconnaît
 * leurs colonnes dès l'envoi. Un clic lance ensuite l'analyse complète : le
 * serveur crée le jeu, contrôle la qualité, calcule le diagnostic et les trois
 * scénarios de référence, puis la vue d'ensemble s'ouvre.
 *
 * L'utilisateur n'a la main que dans un seul cas : une information
 * indispensable introuvable dans ses fichiers. L'analyse s'arrête alors sur la
 * correspondance des colonnes, et reprend une fois la correction faite.
 */

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { FlaskConical, Play, RefreshCw, ShieldCheck } from 'lucide-react'

import { messageErreur, type DataQualityReport, type FichierImporte, type IdJeu, type TypeFichier } from '@shared/api'
import { MENTION_DEMONSTRATION } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import {
  useCorrigerCorrespondances,
  useCreerJeu,
  useCreerJeuDemonstration,
  useEnvoyerFichier,
} from '../application/hooks'
import { TYPES_FICHIER, colonnesRequisesManquantes } from '../domain/correspondances'
import { CarteFichier } from './composants/CarteFichier'
import { DataQualityPanel } from './composants/DataQualityPanel'
import { JeuxEnregistres } from './composants/JeuxEnregistres'
import { SuiviAnalyse, type AvancementEtape, type CleEtape, type EtatEtape } from './composants/SuiviAnalyse'
import { TableCorrespondance } from './composants/TableCorrespondance'

/** Délai laissé pour lire le bilan avant d'ouvrir la vue d'ensemble. */
const DELAI_OUVERTURE_MS = 1200

type FichiersEnvoyes = Record<TypeFichier, FichierImporte | null>

/** Page « Ajouter les données ». */
export function ImportPage() {
  const { jeu: jeuOuvert, ouvrirJeu, fermerJeu } = useSession()

  const envoi = useEnvoyerFichier()
  const correction = useCorrigerCorrespondances()
  const creation = useCreerJeu()
  const demonstration = useCreerJeuDemonstration()

  const [fichiers, setFichiers] = useState<FichiersEnvoyes>({ etablissements: null, enseignants: null })
  const [erreurs, setErreurs] = useState<Partial<Record<TypeFichier, string>>>({})
  const [enLecture, setEnLecture] = useState<TypeFichier | null>(null)
  const [avancement, setAvancement] = useState<Partial<Record<CleEtape, AvancementEtape>>>({})
  const [blocage, setBlocage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const [qualite, setQualite] = useState<DataQualityReport | null>(null)
  /** Jeu créé par la dernière analyse, ouvert après un court délai. */
  const [jeuCree, setJeuCree] = useState<IdJeu | null>(null)

  const enCours = creation.isPending
  const complet = !!fichiers.etablissements && !!fichiers.enseignants

  // Laisse le bilan visible un instant, puis ouvre le jeu créé.
  useEffect(() => {
    if (!jeuCree) return
    const minuteur = window.setTimeout(() => ouvrirJeu(jeuCree), DELAI_OUVERTURE_MS)
    return () => window.clearTimeout(minuteur)
  }, [jeuCree, ouvrirJeu])

  function marquer(cle: CleEtape, etat: EtatEtape, detail?: string) {
    setAvancement(courant => ({ ...courant, [cle]: { etat, detail } }))
  }

  /** Envoie un classeur au serveur, qui le lit et reconnaît ses colonnes. */
  async function choisirFichier(type: TypeFichier, fichier: File) {
    setEnLecture(type)
    setErreurs(courantes => ({ ...courantes, [type]: undefined }))
    setQualite(null)
    try {
      const lu = await envoi.mutateAsync({ type, fichier })
      setFichiers(courants => ({ ...courants, [type]: lu }))
    } catch (erreur) {
      setErreurs(courantes => ({ ...courantes, [type]: messageErreur(erreur) }))
      setFichiers(courants => ({ ...courants, [type]: null }))
    } finally {
      setEnLecture(null)
    }
  }

  /** Corrige une correspondance ; le serveur renvoie la table à jour. */
  function corrigerCorrespondance(type: TypeFichier, champ: string, enTete: string | null) {
    const fichier = fichiers[type]
    if (!fichier) return
    correction.mutate(
      { fichier: fichier.id, correspondances: { [champ]: enTete } },
      { onSuccess: misAJour => setFichiers(courants => ({ ...courants, [type]: misAJour })) },
    )
  }

  /** Enchaîne les étapes ; seule une colonne indispensable manquante interrompt l'analyse. */
  async function lancerAnalyse() {
    const { etablissements, enseignants } = fichiers
    if (!etablissements || !enseignants || enCours) return

    setBlocage(null)
    setEchec(null)
    setQualite(null)
    setAvancement({})

    marquer(
      'lecture',
      'faite',
      `${fmt(etablissements.lignes)} établissements et ${fmt(enseignants.lignes)} enseignants lus.`,
    )

    const manquants = [
      ...colonnesRequisesManquantes(etablissements.correspondances),
      ...colonnesRequisesManquantes(enseignants.correspondances),
    ]
    if (manquants.length > 0) {
      marquer('colonnes', 'bloquee', `${manquants.length} information(s) indispensable(s) introuvable(s).`)
      setBlocage(
        `${manquants.map(m => m.label).join(', ')} : ces informations n'ont pas été retrouvées dans vos fichiers. Indiquez la colonne correspondante ci-dessous, puis relancez l'analyse.`,
      )
      return
    }
    const reconnues = [...etablissements.correspondances.matches, ...enseignants.correspondances.matches]
    marquer(
      'colonnes',
      'faite',
      `${reconnues.filter(m => m.enTete).length} informations reconnues sur ${reconnues.length}.`,
    )

    marquer('calcul', 'encours')
    try {
      const cree = await creation.mutateAsync({ etablissements: etablissements.id, enseignants: enseignants.id })
      setQualite(cree.qualite)
      marquer(
        'calcul',
        'faite',
        `Qualité ${cree.qualite.score} sur 100 (${cree.qualite.appreciation.toLowerCase()}) · ${fmt(cree.jeu.nbUnitesCalcul)} établissements analysés · scénarios de référence calculés.`,
      )
      setJeuCree(cree.jeu.id)
    } catch (erreur) {
      marquer('calcul', 'bloquee', messageErreur(erreur))
      setEchec(messageErreur(erreur))
    }
  }

  function explorerDemonstration() {
    setEchec(null)
    demonstration.mutate(undefined, {
      onSuccess: cree => ouvrirJeu(cree.jeu.id),
      onError: erreur => setEchec(messageErreur(erreur)),
    })
  }

  const occupe = enCours || demonstration.isPending || jeuCree !== null

  return (
    <div className="stack">
      {!occupe && (
        <section className="welcome">
          <Image className="welcome-logo" src="/logo-full.png" alt="Logo AlgoPlanR" width={640} height={424} priority />
          <div>
            <h2>Bienvenue dans AlgoPlanR</h2>
            <p>
              Ajoutez la liste des établissements et celle des enseignants : la plateforme contrôle les données, mesure
              les besoins de chaque école et simule des scénarios de redéploiement.
            </p>
          </div>
        </section>
      )}

      <Notice tone="info" title="Traitement local.">
        Les classeurs sont envoyés au serveur AlgoPlanR installé sur ce poste, qui les analyse et les conserve. Ils ne
        quittent pas la machine et aucune connexion Internet n’est nécessaire.
      </Notice>

      {!occupe && (
        <JeuxEnregistres jeuOuvert={jeuOuvert} onOuvrir={id => ouvrirJeu(id)} onJeuOuvertSupprime={fermerJeu} />
      )}

      {Object.keys(avancement).length > 0 && (
        <SuiviAnalyse avancement={avancement} enCours={enCours} interrompue={!!blocage || !!echec} />
      )}

      <div className="upload-cards">
        {TYPES_FICHIER.map(type => (
          <CarteFichier
            key={type}
            type={type}
            fichier={fichiers[type]}
            erreur={erreurs[type] ?? null}
            enLecture={enLecture === type}
            desactive={occupe}
            onFichier={fichier => void choisirFichier(type, fichier)}
          />
        ))}
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!complet || occupe || enLecture !== null}
          onClick={() => void lancerAnalyse()}
        >
          {enCours ? (
            <RefreshCw size={15} className="spin" aria-hidden="true" />
          ) : (
            <Play size={15} aria-hidden="true" />
          )}
          {enCours ? 'Analyse en cours…' : 'Lancer l’analyse complète'}
          <span className="btn-count">{TYPES_FICHIER.filter(t => fichiers[t]).length}/2</span>
        </button>
        <button type="button" className="btn" disabled={occupe} onClick={explorerDemonstration}>
          {demonstration.isPending ? (
            <RefreshCw size={15} className="spin" aria-hidden="true" />
          ) : (
            <FlaskConical size={15} aria-hidden="true" />
          )}{' '}
          Explorer avec des données de démonstration
        </button>
      </div>

      <Notice tone="warn" title="Données de démonstration.">
        {MENTION_DEMONSTRATION}
      </Notice>

      <p className="hint hint-icone">
        <ShieldCheck size={15} aria-hidden="true" /> La première feuille de chaque classeur est lue, sa première ligne
        servant d’en-têtes. Un seul clic suffit ensuite : contrôle qualité, diagnostic et simulations s’enchaînent sur
        le serveur, et la vue d’ensemble s’ouvre à la fin.
      </p>

      {echec && (
        <Notice tone="alert" title="L’analyse n’a pas pu aboutir.">
          {echec}
        </Notice>
      )}

      {blocage && (
        <div className="stack">
          <Notice tone="alert" title="Information indispensable manquante.">
            {blocage}
          </Notice>
          {TYPES_FICHIER.map(type => {
            const fichier = fichiers[type]
            if (!fichier) return null
            return (
              <TableCorrespondance
                key={type}
                fichier={fichier}
                enregistrement={correction.isPending}
                onChange={(champ, enTete) => corrigerCorrespondance(type, champ, enTete)}
              />
            )
          })}
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={occupe || correction.isPending}
              onClick={() => void lancerAnalyse()}
            >
              <RefreshCw size={15} aria-hidden="true" /> Relancer l’analyse
            </button>
          </div>
        </div>
      )}

      {qualite && !blocage && (
        <Panel
          kicker="Contrôle"
          title="Qualité des données"
          hint="Ce contrôle liste tout ce qui pourrait fausser l’analyse. Rien n’est masqué : les avertissements restent visibles même quand le score est bon."
        >
          <DataQualityPanel rapport={qualite} />
        </Panel>
      )}
    </div>
  )
}
