'use client'

/**
 * Import des données, en une seule action.
 *
 * L'utilisateur dépose ses deux classeurs, un par un ou en choisissant le
 * dossier qui les contient ; le serveur les lit et reconnaît
 * leurs colonnes dès l'envoi. Un clic lance ensuite l'analyse complète : le
 * serveur crée le jeu, contrôle la qualité, calcule le diagnostic et les trois
 * scénarios de référence, puis la vue d'ensemble s'ouvre.
 *
 * L'utilisateur n'a la main que dans un seul cas : une information
 * indispensable introuvable dans ses fichiers. L'analyse s'arrête alors sur la
 * correspondance des colonnes, et reprend une fois la correction faite.
 */

import { useEffect, useState } from 'react'
import { FlaskConical, Play, RefreshCw, ShieldCheck } from 'lucide-react'

import { useUtilisateur } from '@components/acces'
import {
  messageErreur,
  type BilanImportPrince,
  type DataQualityReport,
  type FichierImporte,
  type IdJeu,
  type TypeFichier,
  type TypeFichierEnvoi,
} from '@shared/api'
import { MENTION_DEMONSTRATION, anneeScolaireCourante, anneeScolaireValide } from '@shared/kernel'
import { useSession } from '@shared/session'
import { Notice, Panel, fmt } from '@shared/ui/commun'

import {
  useColonnesAttendues,
  useCorrigerCorrespondances,
  useCreerJeu,
  useCreerJeuDemonstration,
  useEnvoyerFichier,
} from '../application/hooks'
import { lireEntetes } from '../application/lectureEntetes'
import { TYPES_FICHIER, colonnesRequisesManquantes } from '../domain/correspondances'
import { estClasseur, repartir, type ClasseurLu } from '../domain/triDossier'
import { CarteFichier } from './composants/CarteFichier'
import { ChoixDossier, type BilanDossier } from './composants/ChoixDossier'
import { ChoixFaitsPrince } from './composants/ChoixFaitsPrince'
import { DataQualityPanel } from './composants/DataQualityPanel'
import { JeuxEnregistres } from './composants/JeuxEnregistres'
import { SuiviAnalyse, type AvancementEtape, type CleEtape, type EtatEtape } from './composants/SuiviAnalyse'
import { TableCorrespondance } from './composants/TableCorrespondance'

/** Délai laissé pour lire le bilan avant d'ouvrir la vue d'ensemble. */
const DELAI_OUVERTURE_MS = 1200
/** Délai plus long quand des décisions du prince ont été refusées : l'utilisateur doit pouvoir les lire. */
const DELAI_OUVERTURE_REFUS_MS = 8000

type FichiersEnvoyes = Record<TypeFichier, FichierImporte | null>

/**
 * Page « Ajouter les données ». Le DRH importe le fichier de la base nationale
 * (jeu national). Un délégué
 * importe les classeurs de sa région, ou la base nationale : le serveur la
 * reconnaît seul et n'en retient que sa région. Dans tous les cas, un dossier entier peut être choisi.
 */
export function ImportPage() {
  const utilisateur = useUtilisateur()
  if (utilisateur?.role === 'delegue') return <ImportClasseurs estDrh={false} region={utilisateur.region} />
  return <ImportClasseurs estDrh={utilisateur?.role === 'drh'} region={null} />
}

function ImportClasseurs({ estDrh, region }: { estDrh: boolean; region: string | null }) {
  const { jeu: jeuOuvert, ouvrirJeu, fermerJeu } = useSession()

  const envoi = useEnvoyerFichier()
  const correction = useCorrigerCorrespondances()
  const creation = useCreerJeu()
  const demonstration = useCreerJeuDemonstration()

  const [fichiers, setFichiers] = useState<FichiersEnvoyes>({ etablissements: null, enseignants: null })
  const [erreurs, setErreurs] = useState<Partial<Record<TypeFichier, string>>>({})
  const [enLecture, setEnLecture] = useState<TypeFichierEnvoi | null>(null)
  const [avancement, setAvancement] = useState<Partial<Record<CleEtape, AvancementEtape>>>({})
  const [blocage, setBlocage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const [qualite, setQualite] = useState<DataQualityReport | null>(null)
  // Année scolaire des données importées ; vide = l'année en cours, fixée par le serveur.
  const [anneeScolaire, setAnneeScolaire] = useState('')
  const anneeInvalide = anneeScolaire.trim() !== '' && !anneeScolaireValide(anneeScolaire)
  // Jeu de test fictif déclaré à l'import : seule origine vérifiable d'un import (jamais déduite du nom du fichier).
  const [donneesFictives, setDonneesFictives] = useState(false)
  /** Réponse au menu « fichier des faits du prince » ; `null` tant que le DRH n'a pas répondu. */
  const [souhaitePrince, setSouhaitePrince] = useState<boolean | null>(null)
  const [fichierPrince, setFichierPrince] = useState<FichierImporte | null>(null)
  const [erreurPrince, setErreurPrince] = useState<string | null>(null)
  const [bilanPrince, setBilanPrince] = useState<BilanImportPrince | null>(null)
  /** Jeu créé par la dernière analyse, ouvert après un court délai. */
  const [jeuCree, setJeuCree] = useState<IdJeu | null>(null)

  const colonnesEtablissements = useColonnesAttendues('etablissements')
  const colonnesEnseignants = useColonnesAttendues('enseignants')
  const [triEnCours, setTriEnCours] = useState(false)
  const [bilanDossier, setBilanDossier] = useState<BilanDossier | null>(null)
  const [erreurDossier, setErreurDossier] = useState<string | null>(null)

  const enCours = creation.isPending
  const complet = !!fichiers.etablissements && !!fichiers.enseignants
  // Le menu du prince n'est proposé qu'au DRH, une fois les deux bases chargées.
  const proposePrince = estDrh && complet
  const princeAttendu = proposePrince && souhaitePrince === true
  const prete =
    complet && !anneeInvalide && (!proposePrince || souhaitePrince !== null) && (!princeAttendu || !!fichierPrince)

  // Laisse le bilan visible un instant, puis ouvre le jeu créé : sur le Fait de Prince quand un fichier de décisions a
  // été joint (on y voit ce qu'elles changent aux bases), sinon sur le tableau de bord.
  useEffect(() => {
    if (!jeuCree) return
    const delai = bilanPrince && bilanPrince.refus.length > 0 ? DELAI_OUVERTURE_REFUS_MS : DELAI_OUVERTURE_MS
    const minuteur = window.setTimeout(() => ouvrirJeu(jeuCree, bilanPrince ? 'prince' : undefined), delai)
    return () => window.clearTimeout(minuteur)
  }, [jeuCree, bilanPrince, ouvrirJeu])

  function marquer(cle: CleEtape, etat: EtatEtape, detail?: string) {
    setAvancement(courant => ({ ...courant, [cle]: { etat, detail } }))
  }

  /** Envoie un classeur au serveur, qui le lit et reconnaît ses colonnes. */
  async function choisirFichier(type: TypeFichier, fichier: File) {
    setEnLecture(type)
    setErreurs(courantes => ({ ...courantes, [type]: undefined }))
    setQualite(null)
    try {
      // Le serveur reconnaît seul un fichier national et en extrait la région du délégué.
      const lu = await envoi.mutateAsync({ type, fichier, baseNationale: estDrh })
      setFichiers(courants => ({ ...courants, [type]: lu }))
    } catch (erreur) {
      setErreurs(courantes => ({ ...courantes, [type]: messageErreur(erreur) }))
      setFichiers(courants => ({ ...courants, [type]: null }))
    } finally {
      setEnLecture(null)
    }
  }

  /** Envoie le fichier des faits du prince ; ses colonnes sont reconnues comme celles des deux autres classeurs. */
  async function choisirFichierPrince(fichier: File) {
    setEnLecture('prince')
    setErreurPrince(null)
    try {
      setFichierPrince(await envoi.mutateAsync({ type: 'prince', fichier }))
    } catch (erreur) {
      setErreurPrince(messageErreur(erreur))
      setFichierPrince(null)
    } finally {
      setEnLecture(null)
    }
  }

  /**
   * Range les classeurs d'un dossier dans leur compartiment d'après leurs
   * en-têtes, puis envoie le classeur retenu pour chacun.
   */
  async function choisirDossier(liste: File[]) {
    setErreurDossier(null)
    setBilanDossier(null)
    if (!colonnesEtablissements.data || !colonnesEnseignants.data) {
      setErreurDossier(
        'La liste des colonnes attendues n’a pas pu être lue auprès du serveur : déposez les fichiers un par un.',
      )
      return
    }
    const colonnes = { etablissements: colonnesEtablissements.data, enseignants: colonnesEnseignants.data }
    setTriEnCours(true)
    try {
      const candidats = liste.filter(f => estClasseur(f.name))
      const classeurs = await Promise.all(
        candidats.map(async (fichier): Promise<ClasseurLu<File>> => {
          const chemin = fichier.webkitRelativePath || fichier.name
          try {
            return { fichier, chemin, entetes: await lireEntetes(fichier) }
          } catch (erreur) {
            return { fichier, chemin, entetes: null, erreur: `Classeur illisible : ${messageErreur(erreur)}` }
          }
        }),
      )
      const { retenus, ignores } = repartir(classeurs, colonnes)
      setBilanDossier({
        retenus: Object.fromEntries(Object.entries(retenus).map(([type, c]) => [type, c.chemin])),
        ignores,
        autresFichiers: liste.length - candidats.length,
      })
      for (const type of TYPES_FICHIER) {
        const classeur = retenus[type]
        if (classeur) await choisirFichier(type, classeur.fichier)
      }
    } finally {
      setTriEnCours(false)
    }
  }

  /** Corrige une correspondance ; le serveur renvoie la table à jour. */
  function corrigerCorrespondance(type: TypeFichierEnvoi, champ: string, enTete: string | null) {
    const fichier = type === 'prince' ? fichierPrince : fichiers[type]
    if (!fichier) return
    correction.mutate(
      { fichier: fichier.id, correspondances: { [champ]: enTete } },
      {
        onSuccess: misAJour =>
          type === 'prince' ? setFichierPrince(misAJour) : setFichiers(courants => ({ ...courants, [type]: misAJour })),
      },
    )
  }

  /** Enchaîne les étapes ; seule une colonne indispensable manquante interrompt l'analyse. */
  async function lancerAnalyse() {
    const { etablissements, enseignants } = fichiers
    if (!etablissements || !enseignants || enCours) return

    setBlocage(null)
    setEchec(null)
    setQualite(null)
    setBilanPrince(null)
    setAvancement({})

    marquer(
      'lecture',
      'faite',
      `${fmt(etablissements.lignes)} établissements et ${fmt(enseignants.lignes)} enseignants lus` +
        (region && (etablissements.baseNationale || enseignants.baseNationale)
          ? ` dans la base nationale ; seule la région ${region} sera retenue.`
          : '.'),
    )

    const manquants = [
      ...colonnesRequisesManquantes(etablissements.correspondances),
      ...colonnesRequisesManquantes(enseignants.correspondances),
      ...(princeAttendu && fichierPrince ? colonnesRequisesManquantes(fichierPrince.correspondances) : []),
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

    // Contrôle qualité, diagnostic et scénarios : une seule requête au serveur.
    marquer('qualite', 'encours')
    marquer('diagnostic', 'encours')
    marquer('simulation', 'encours')
    try {
      const cree = await creation.mutateAsync({
        etablissements: etablissements.id,
        enseignants: enseignants.id,
        ...(princeAttendu && fichierPrince ? { prince: fichierPrince.id } : {}),
        ...(anneeScolaire.trim() ? { anneeScolaire: anneeScolaire.trim() } : {}),
        // Sens enregistré explicitement : l'année saisie est celle des données (base des projections).
        sensAnneeScolaire: 'donnees' as const,
        ...(donneesFictives ? { donneesFictives: true } : {}),
      })
      setQualite(cree.qualite)
      setBilanPrince(cree.prince ?? null)
      marquer('qualite', 'faite', `Qualité ${cree.qualite.score} sur 100 (${cree.qualite.appreciation.toLowerCase()}).`)
      marquer('diagnostic', 'faite', `${fmt(cree.jeu.nbUnitesCalcul)} établissements analysés.`)
      marquer('simulation', 'faite', 'Scénarios de référence calculés.')
      setJeuCree(cree.jeu.id)
    } catch (erreur) {
      marquer('qualite', 'bloquee', messageErreur(erreur))
      marquer('diagnostic', 'attente')
      marquer('simulation', 'attente')
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
      {/* La présentation de la plateforme est sur l'écran de bienvenue : ici, seulement la consigne. */}
      {!occupe &&
        (estDrh ? (
          <p className="import-consigne">
            Choisissez le dossier de la base nationale, ou déposez le fichier national des établissements et celui des
            enseignants, puis lancez l’analyse : le jeu national créé couvre toutes les régions.
          </p>
        ) : (
          <p className="import-consigne">
            Choisissez le dossier qui contient vos classeurs, ou déposez le fichier des établissements et celui des
            enseignants (ceux de votre région, ou ceux de la base nationale : seule votre région est alors retenue),
            puis lancez l’analyse : contrôle qualité, diagnostic et scénarios de référence s’enchaînent sur le serveur.
          </p>
        ))}

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

      {region && (fichiers.etablissements?.baseNationale || fichiers.enseignants?.baseNationale) && !occupe && (
        <Notice tone="info" title="Base nationale reconnue.">
          Seules les écoles de la région {region} et les enseignants qui y sont rattachés seront retenus ; les autres
          régions sont écartées automatiquement.
        </Notice>
      )}

      <ChoixDossier
        desactive={occupe || enLecture !== null}
        enCours={triEnCours}
        bilan={bilanDossier}
        erreur={erreurDossier}
        onDossier={liste => void choisirDossier(liste)}
      />

      <div className="upload-cards">
        {TYPES_FICHIER.map(type => (
          <CarteFichier
            key={type}
            type={type}
            fichier={fichiers[type]}
            erreur={erreurs[type] ?? null}
            enLecture={enLecture === type}
            desactive={occupe || triEnCours}
            onFichier={fichier => void choisirFichier(type, fichier)}
          />
        ))}
      </div>

      {!occupe && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="import-annee">Année scolaire des données importées</label>
          <input
            id="import-annee"
            type="text"
            inputMode="numeric"
            placeholder={anneeScolaireCourante()}
            value={anneeScolaire}
            aria-invalid={anneeInvalide}
            onChange={e => setAnneeScolaire(e.target.value)}
          />
          <span className="hint">
            {anneeInvalide
              ? 'Saisissez deux années consécutives, par exemple 2026-2027.'
              : 'L’année scolaire à laquelle se rapportent les fichiers (base des projections ; N+1 est l’année suivante). L’année en cours si vous laissez vide. Son sens (année des données) est enregistré avec le jeu ; une personne habilitée peut le corriger ensuite, avec trace au journal.'}
          </span>
          <label className="hint">
            <input type="checkbox" checked={donneesFictives} onChange={e => setDonneesFictives(e.target.checked)} />{' '}
            Données fictives (jeu de test) : un bandeau l’indiquera dans les vues et les exports.
          </label>
        </div>
      )}

      {proposePrince && !jeuCree && (
        <ChoixFaitsPrince
          souhaite={souhaitePrince}
          onChoix={setSouhaitePrince}
          fichier={fichierPrince}
          erreur={erreurPrince}
          enLecture={enLecture === 'prince'}
          desactive={occupe || triEnCours}
          onFichier={fichier => void choisirFichierPrince(fichier)}
        />
      )}

      {bilanPrince && (
        <Notice
          tone={bilanPrince.refus.length > 0 ? 'warn' : 'info'}
          title={`Faits du prince : ${fmt(bilanPrince.acceptees)} décision(s) appliquée(s) avant l’algorithme.`}
        >
          {bilanPrince.refus.length > 0
            ? `${fmt(bilanPrince.refus.length)} ligne(s) refusée(s) : ${bilanPrince.refus.join(' ; ')}`
            : 'Toutes les lignes du fichier ont été retenues.'}
        </Notice>
      )}

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!prete || occupe || enLecture !== null}
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
          {[...TYPES_FICHIER, ...(princeAttendu ? (['prince'] as const) : [])].map(type => {
            const fichier = type === 'prince' ? fichierPrince : fichiers[type]
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
