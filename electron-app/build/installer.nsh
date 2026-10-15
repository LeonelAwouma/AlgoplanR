; Personnalisation de l'installateur Windows (chargé automatiquement par electron-builder).
;
; Par défaut, electron-builder embarque l'application dans une archive 7z que l'installateur
; traite en trois temps : copie de l'archive (108 Mo) dans un dossier temporaire, extraction,
; puis copie silencieuse des fichiers vers le dossier final. Chacune de ces étapes recalcule la
; barre de progression : elle monte, est remise à zéro, monte de nouveau, puis retombe.
;
; Ici, on demande à NSIS d'embarquer directement les fichiers de l'application (`File /r`), avec
; son propre compresseur : il n'y a plus qu'une seule étape, et la barre avance sans jamais
; reculer (mesuré : 10 s d'installation, aucun retour en arrière, contre plus de 20 s et plusieurs
; retours en arrière avec l'archive 7z). C'est la branche `APP_BUILD_DIR` prévue par electron-builder mais
; désactivée dans sa version actuelle ; elle s'active en définissant cette constante.
;
; Le dossier de l'application empaquetée est transmis par build/afterPack.js dans la variable
; d'environnement ALGOBABA_APP_DIR (chemin absolu). Sans elle, on garde le comportement par défaut.

!ifndef APP_BUILD_DIR
  !if "$%ALGOBABA_APP_DIR%" != ""
    !define APP_BUILD_DIR "$%ALGOBABA_APP_DIR%"
  !endif
!endif

; --- Mises à jour : aucune question, relance automatique ----------------------------------
;
; Quand l'application installe une mise à jour qu'elle vient de télécharger (bouton
; « Redémarrer et installer »), l'installateur est lancé avec --updated. Il affiche alors
; la barre de progression et le logo, mais deux pages n'ont plus de sens :
;   — « Choisissez les options d'installation » (pour moi / pour tous) : le choix a été fait
;     à la première installation ; on reprend le même mode, sans le redemander ;
;   — la page de fin « Fermer » : l'application se relance d'elle-même.
; La première installation n'est pas concernée : elle garde toutes ses pages.

!macro customInstallMode
  ${if} ${isUpdated}
    ${if} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${else}
      StrCpy $isForceCurrentInstall "1"
    ${endif}
  ${endif}
!macroend

!macro customFinishPage
  ; Même lancement que la page de fin standard d'electron-builder.
  Function algobabaLancer
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  ; En mise à jour, la page de fin est sautée et l'application relancée aussitôt.
  Function algobabaAvantPageFin
    ${if} ${isUpdated}
      Call algobabaLancer
      Abort
    ${endif}
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "algobabaLancer"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE algobabaAvantPageFin
  !insertmacro MUI_PAGE_FINISH
!macroend
