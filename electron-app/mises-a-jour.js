// Mises à jour automatiques de l'application de bureau.
//
// Au démarrage, puis toutes les quatre heures, l'application demande à GitHub
// Releases (dépôt public LeonelAwouma/algorithm_need_school) si une version plus
// récente existe. Si oui, elle la télécharge en arrière-plan, vérifie son
// empreinte SHA-512, puis l'installe à la fermeture — ou tout de suite, si
// l'utilisateur clique sur « Redémarrer et installer ».
//
// C'est le seul échange réseau de l'application. Il ne transmet aucune donnée :
// ni fichier importé, ni résultat, ni identifiant d'utilisateur — seulement la
// demande du fichier de version publié. Sans connexion, la vérification échoue
// en silence et l'application fonctionne normalement.
//
// Pour les postes où tout accès extérieur est proscrit, la variable
// d'environnement ALGOBABA_SANS_MISE_A_JOUR=1 désactive entièrement ce module.

const path = require('node:path')
const fs = require('node:fs')
const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

/** Délai avant la première vérification : laisse l'application s'ouvrir sans la ralentir. */
const PREMIERE_VERIFICATION_MS = 8_000
/** Intervalle entre deux vérifications, pour un poste qui reste ouvert toute la journée. */
const INTERVALLE_MS = 4 * 60 * 60 * 1000
/** Au-delà, le journal est vidé : il ne sert qu'au diagnostic des derniers échanges. */
const TAILLE_MAX_JOURNAL = 512 * 1024

/**
 * État transmis à l'interface. `phase` suit le cycle d'une mise à jour ;
 * l'interface n'affiche quelque chose qu'en téléchargement et une fois prête.
 */
let etat = { phase: 'inactive', versionActuelle: app.getVersion() }

/** Journal local, dans le dossier de données de l'utilisateur, pour le diagnostic. */
function creerJournal() {
  const fichier = path.join(app.getPath('userData'), 'mises-a-jour.log')
  const ecrire = (niveau, args) => {
    try {
      if (fs.existsSync(fichier) && fs.statSync(fichier).size > TAILLE_MAX_JOURNAL) fs.writeFileSync(fichier, '')
      const texte = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      fs.appendFileSync(fichier, `${new Date().toISOString()} [${niveau}] ${texte}\n`)
    } catch {
      // Un journal inaccessible ne doit jamais empêcher l'application de fonctionner.
    }
  }
  return {
    info: (...a) => ecrire('info', a),
    warn: (...a) => ecrire('avertissement', a),
    error: (...a) => ecrire('erreur', a),
    debug: () => {},
  }
}

function publier(fenetre, maj) {
  etat = { ...etat, ...maj }
  const win = fenetre()
  if (win && !win.isDestroyed()) win.webContents.send('maj:etat', etat)
}

/**
 * Branche le cycle de mise à jour. `fenetre` renvoie la fenêtre principale
 * courante (elle peut être recréée), pour lui transmettre chaque changement d'état.
 */
function demarrerMisesAJour(fenetre) {
  ipcMain.handle('maj:etat', () => etat)
  ipcMain.handle('maj:installer', () => {
    if (etat.phase !== 'prete') return false
    // Installateur non silencieux : l'utilisateur voit la barre de progression et
    // le logo, comme à la première installation ; l'application se relance ensuite.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  })

  if (!app.isPackaged && !process.env.ALGOBABA_TEST_MISE_A_JOUR) {
    etat = { ...etat, phase: 'inactive', motif: 'Application non installée (mode développement).' }
    return
  }
  if (process.env.ALGOBABA_SANS_MISE_A_JOUR === '1') {
    etat = { ...etat, phase: 'inactive', motif: 'Mises à jour désactivées sur ce poste.' }
    return
  }

  const journal = creerJournal()
  autoUpdater.logger = journal
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  if (process.env.ALGOBABA_TEST_MISE_A_JOUR) autoUpdater.forceDevUpdateConfig = true

  autoUpdater.on('checking-for-update', () => publier(fenetre, { phase: 'verification' }))
  autoUpdater.on('update-not-available', () => publier(fenetre, { phase: 'a-jour' }))
  autoUpdater.on('update-available', info =>
    publier(fenetre, { phase: 'telechargement', nouvelleVersion: info.version, pourcentage: 0 }),
  )
  autoUpdater.on('download-progress', p =>
    publier(fenetre, { phase: 'telechargement', pourcentage: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', info => {
    journal.info(`Version ${info.version} téléchargée et vérifiée, prête à installer.`)
    publier(fenetre, { phase: 'prete', nouvelleVersion: info.version, pourcentage: 100 })
  })
  autoUpdater.on('error', err => {
    // Hors connexion, pare-feu, GitHub injoignable : rien à signaler à l'utilisateur,
    // la vérification reprendra au prochain intervalle.
    journal.warn('Vérification impossible :', err)
    if (etat.phase !== 'prete') publier(fenetre, { phase: 'indisponible' })
  })

  const verifier = () => {
    if (etat.phase === 'telechargement' || etat.phase === 'prete') return
    autoUpdater.checkForUpdates().catch(err => journal.warn('Vérification impossible :', err))
  }
  setTimeout(verifier, PREMIERE_VERIFICATION_MS)
  setInterval(verifier, INTERVALLE_MS).unref()
}

module.exports = { demarrerMisesAJour }
