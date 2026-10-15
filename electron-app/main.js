// Processus principal Electron : lance le backend AlgoPlanR (Django/waitress, figé par PyInstaller)
// sur un port local libre avec un jeton secret tiré à chaque démarrage, puis affiche dans une fenêtre
// l'interface que ce backend sert lui-même (export statique Next.js, même origine : pas de CORS).
// Aucune donnée ne quitte la machine : le serveur n'écoute que sur 127.0.0.1. Le seul échange réseau
// est la recherche de mises à jour (voir mises-a-jour.js), qui ne transmet aucune donnée d'utilisateur.

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { app, BrowserWindow, Menu, dialog } = require('electron')
const { demarrerMisesAJour } = require('./mises-a-jour')
const { brancherStockage } = require('./stockage')

/** Fenêtre principale courante, pour lui transmettre l'état des mises à jour. */
let fenetrePrincipale = null
/** Processus du backend, arrêté à la fermeture de l'application. */
let backend = null
/** Fenêtre de démarrage, affichée pendant que le backend se lance. */
let fenetreDemarrage = null
/** Vrai une fois la fenêtre principale affichée : avant, fermer la fenêtre de démarrage ne quitte pas l'application. */
let fenetrePrincipaleAffichee = false

/**
 * Port préféré du backend. L'adresse de la page (donc son stockage local : jeu ouvert, thème, mode)
 * ne doit pas changer d'un lancement à l'autre ; un port occupé retombe sur un port libre.
 */
const PORT_PREFERE = 47831

/** Port utilisable : le port préféré s'il est libre, sinon 0 (le système en choisit un). */
function choisirPort() {
  return new Promise(resolve => {
    const test = net.createServer()
    test.once('error', () => resolve(0))
    test.listen(PORT_PREFERE, '127.0.0.1', () => test.close(() => resolve(PORT_PREFERE)))
  })
}

const PAGE_DEMARRAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>AlgoPlanR</title>
<style>
  html,body{margin:0;height:100%;font-family:'Segoe UI',system-ui,sans-serif;background:#00373c;color:#fff;
    display:flex;align-items:center;justify-content:center;-webkit-app-region:drag;user-select:none}
  main{text-align:center;padding:0 32px}
  h1{margin:0 0 4px;font-size:26px;letter-spacing:.12em}
  p{margin:0;font-size:13px;opacity:.82}
  .barre{margin:22px auto 14px;width:220px;height:4px;border-radius:2px;background:rgba(255,255,255,.2);overflow:hidden}
  .barre i{display:block;width:40%;height:100%;border-radius:2px;background:#3f9ea1;animation:va 1.2s ease-in-out infinite}
  @keyframes va{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
</style>
<main><h1>ALGOPLANR</h1><p>Planification et affectation des enseignants</p>
<div class="barre"><i></i></div><p>Démarrage du serveur local…</p></main></html>`

/** Affiche tout de suite une petite fenêtre de démarrage : le backend met quelques secondes à répondre. */
function afficherDemarrage() {
  fenetreDemarrage = new BrowserWindow({
    width: 460,
    height: 280,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'AlgoPlanR',
    backgroundColor: '#00373c',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  void fenetreDemarrage.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE_DEMARRAGE)}`)
}

function fermerDemarrage() {
  if (fenetreDemarrage && !fenetreDemarrage.isDestroyed()) fenetreDemarrage.close()
  fenetreDemarrage = null
}

/** Dossier de l'interface exportée : à côté de l'exécutable une fois empaqueté, sous ../frontend en développement. */
function resolveStaticDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'out')
    : path.join(__dirname, '..', 'frontend', 'out')
}

/** Commande qui lance le backend : exécutable figé une fois installé, interpréteur du venv en développement. */
function commandeBackend() {
  if (app.isPackaged) {
    return { cmd: path.join(process.resourcesPath, 'backend', 'algoplanr-serveur.exe'), args: [], cwd: undefined }
  }
  const dossier = path.join(__dirname, '..', 'backend')
  return {
    cmd: path.join(dossier, '.venv', 'Scripts', 'python.exe'),
    args: ['-m', 'algoplanr.serveur'],
    cwd: dossier,
  }
}

/** Démarre le backend et résout avec son adresse locale et le jeton exigé sur chaque requête. */
async function demarrerBackend() {
  const port = await choisirPort()
  const jeton = crypto.randomBytes(32).toString('hex')
  const { cmd, args, cwd } = commandeBackend()
  return new Promise((resolve, reject) => {
    let sortie = ''
    backend = spawn(cmd, [...args, '--port', String(port)], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ALGOPLANR_JETON: jeton,
        ALGOPLANR_DATA_DIR: path.join(app.getPath('userData'), 'donnees'),
        ALGOPLANR_FRONTEND_DIR: resolveStaticDir(),
        PYTHONIOENCODING: 'utf-8',
      },
    })
    const delai = setTimeout(() => reject(new Error('Le serveur local n’a pas démarré dans le délai imparti.')), 90_000)
    const lire = morceau => {
      sortie += morceau.toString('utf8')
      const m = /ALGOPLANR_PRET (http:\/\/127\.0\.0\.1:\d+)/.exec(sortie)
      if (m) {
        clearTimeout(delai)
        resolve({ baseUrl: m[1], jeton })
      }
    }
    backend.stdout.on('data', lire)
    backend.stderr.on('data', morceau => {
      sortie += morceau.toString('utf8')
    })
    backend.on('error', e => { clearTimeout(delai); reject(e) })
    backend.on('exit', code => {
      clearTimeout(delai)
      reject(new Error(`Le serveur local s’est arrêté (code ${code}).
${sortie.slice(-1500)}`))
    })
  })
}

function arreterBackend() {
  if (backend && !backend.killed) backend.kill()
  backend = null
}

async function createWindow() {
  let api
  try {
    api = await demarrerBackend()
  } finally {
    // En cas d'échec la fenêtre de démarrage ne doit pas masquer le message d'erreur.
    if (!api) fermerDemarrage()
  }

  // Application installée : l'icône est celle de l'exécutable, posée par
  // electron-builder. Ce fichier n'est utile qu'en `npm run start`, où
  // l'exécutable est celui d'Electron.
  const iconePath = path.join(__dirname, 'build', 'icon.ico')

  const win = new BrowserWindow({
    ...(fs.existsSync(iconePath) ? { icon: iconePath } : {}),
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    title: 'AlgoPlanR',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // Adresse et jeton du backend, lus par preload.js (window.algobaba.api).
      additionalArguments: [`--algobaba-api=${JSON.stringify(api)}`],
    },
  })
  fenetrePrincipale = win
  // La fenêtre n'apparaît qu'une fois la page prête : la fenêtre de démarrage ne cède la place qu'à ce moment.
  win.once('ready-to-show', () => {
    fenetrePrincipaleAffichee = true
    fermerDemarrage()
    win.show()
  })

  await win.loadURL(`${api.baseUrl}/`)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  brancherStockage()
  afficherDemarrage()
  demarrerMisesAJour(() => fenetrePrincipale)
  createWindow().catch(e => {
    fermerDemarrage()
    dialog.showErrorBox('AlgoPlanR', `Impossible de démarrer l’application.

${e.message}`)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(() => app.quit())
  })
})

app.on('before-quit', arreterBackend)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && fenetrePrincipaleAffichee) app.quit()
})
