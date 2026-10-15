// Stockage durable de l'application de bureau.
//
// La page est servie sur un port local qui peut changer d'un lancement à l'autre :
// son stockage de navigateur n'est donc pas fiable pour ce qui doit durer. Le
// registre des accès (mot de passe du DRH, codes des délégués, validations) est
// conservé ici, dans un fichier du dossier de données de l'utilisateur.
//
// Seules les clés listées sont acceptées : la page ne peut ni lire ni écrire
// autre chose par ce canal. Aucune donnée d'établissement ou d'enseignant n'y
// figure jamais.

const path = require('node:path')
const fs = require('node:fs')
const { app, ipcMain } = require('electron')

const CLES_AUTORISEES = new Set(['acces'])

const fichier = cle => path.join(app.getPath('userData'), `${cle}.json`)

function brancherStockage() {
  ipcMain.handle('stockage:lire', (_evenement, cle) => {
    if (!CLES_AUTORISEES.has(cle)) return null
    try {
      return JSON.parse(fs.readFileSync(fichier(cle), 'utf8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('stockage:ecrire', (_evenement, cle, valeur) => {
    if (!CLES_AUTORISEES.has(cle)) return false
    // Écriture en deux temps : un arrêt brutal ne laisse jamais un fichier tronqué.
    const cible = fichier(cle)
    const provisoire = `${cible}.tmp`
    fs.mkdirSync(path.dirname(cible), { recursive: true })
    fs.writeFileSync(provisoire, JSON.stringify(valeur))
    fs.renameSync(provisoire, cible)
    return true
  })
}

module.exports = { brancherStockage }
