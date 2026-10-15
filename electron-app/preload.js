// Pont entre la fenêtre et le processus principal.
//
// La page n'a aucun accès à Node ni au système de fichiers (contextIsolation,
// nodeIntegration désactivé). Seules lui sont exposées les fonctions ci-dessous :
// le registre des accès (stockage.js) et les mises à jour. Dans un navigateur
// ordinaire, `window.algobaba` n'existe pas : le registre retombe sur le stockage
// de la page et rien de ce qui concerne les mises à jour n'est affiché.

const { contextBridge, ipcRenderer } = require('electron')

/** Adresse et jeton du backend lancé par main.js, transmis en argument de la fenêtre. */
function lireApi() {
  const arg = process.argv.find(a => a.startsWith('--algobaba-api='))
  if (!arg) return undefined
  try {
    return JSON.parse(arg.slice('--algobaba-api='.length))
  } catch {
    return undefined
  }
}

contextBridge.exposeInMainWorld('algobaba', {
  api: lireApi(),
  /** Stockage durable, limité aux clés prévues par le processus principal (registre des accès). */
  stockage: {
    lire: cle => ipcRenderer.invoke('stockage:lire', cle),
    ecrire: (cle, valeur) => ipcRenderer.invoke('stockage:ecrire', cle, valeur),
  },
  misesAJour: {
    /** État courant : phase, version installée, version disponible, progression. */
    etat: () => ipcRenderer.invoke('maj:etat'),
    /** Appelle `rappel` à chaque changement d'état ; renvoie la fonction de désabonnement. */
    surChangement: rappel => {
      const ecouteur = (_evenement, etat) => rappel(etat)
      ipcRenderer.on('maj:etat', ecouteur)
      return () => ipcRenderer.removeListener('maj:etat', ecouteur)
    },
    /** Ferme l'application, installe la version téléchargée et relance. */
    installer: () => ipcRenderer.invoke('maj:installer'),
  },
})
