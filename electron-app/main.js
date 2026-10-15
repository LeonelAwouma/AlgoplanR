// Processus principal Electron : lance le backend AlgoPlanR (Django/waitress, figé par PyInstaller)
// sur un port local libre avec un jeton secret tiré à chaque démarrage, puis affiche dans une fenêtre
// l'interface que ce backend sert lui-même (export statique Next.js, même origine : pas de CORS).
// Aucune donnée ne quitte la machine : le serveur n'écoute que sur 127.0.0.1. Le seul échange réseau
// est la recherche de mises à jour (voir mises-a-jour.js), qui ne transmet aucune donnée d'utilisateur.

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { app, BrowserWindow, Menu, dialog } = require('electron')
const { demarrerMisesAJour } = require('./mises-a-jour')
const { brancherStockage } = require('./stockage')

/** Fenêtre principale courante, pour lui transmettre l'état des mises à jour. */
let fenetrePrincipale = null
/** Processus du backend, arrêté à la fermeture de l'application. */
let backend = null

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
    args: ['-m', 'algoplanr.serveur', '--port', '0'],
    cwd: dossier,
  }
}

/** Démarre le backend et résout avec son adresse locale et le jeton exigé sur chaque requête. */
function demarrerBackend() {
  const jeton = crypto.randomBytes(32).toString('hex')
  const { cmd, args, cwd } = commandeBackend()
  return new Promise((resolve, reject) => {
    let sortie = ''
    backend = spawn(cmd, app.isPackaged ? ['--port', '0'] : args, {
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
  const api = await demarrerBackend()

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

  await win.loadURL(`${api.baseUrl}/`)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  brancherStockage()
  demarrerMisesAJour(() => fenetrePrincipale)
  createWindow().catch(e => {
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
  if (process.platform !== 'darwin') app.quit()
})
