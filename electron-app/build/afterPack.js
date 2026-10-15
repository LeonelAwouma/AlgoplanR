// Exécuté par electron-builder juste après l'empaquetage de l'application (option `afterPack`).
//
// Il transmet à l'installateur NSIS le dossier exact de l'application empaquetée, sous forme de
// chemin absolu : build/installer.nsh s'en sert pour embarquer directement les fichiers, ce qui
// donne une barre de progression continue à l'installation. Si ce script ne s'exécute pas,
// l'installateur revient au comportement par défaut d'electron-builder (archive 7z).

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    process.env.ALGOBABA_APP_DIR = context.appOutDir
  }
}
