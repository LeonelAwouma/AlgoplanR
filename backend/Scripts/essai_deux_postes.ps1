<#
.SYNOPSIS
  Simule deux postes AlgoPlanR autonomes (poste du DRH, poste du délégué du Centre) sur cette machine.

.DESCRIPTION
  Deux serveurs sont lancés, chacun avec son propre dossier de données et sa propre base SQLite : ils ne
  partagent aucun fichier. Seuls circulent les éléments qu'on transporterait réellement (fichier d'activation,
  carnet, code dicté au téléphone). Le scénario vérifie :
    1. activation du poste du DRH par fichier signé (codes embarqués installés), remise d'un code au Centre ;
    2. activation du poste du délégué par région + code, création obligatoire du mot de passe ;
    3. code inutilisable ensuite, données limitées au Centre, aucun code en clair dans la base du délégué ;
    4. récupération par code de récupération, sans perte de données ;
    5. redémarrage du poste du délégué : persistance du compte.

  Les fichiers de test sont ceux de développement (clé privée de développement), produits par :
    manage.py acces_preparer_activation --type initiale --drh-test ...
    manage.py acces_preparer_codes --numero 1 ...

.EXAMPLE
  pwsh -File scripts\essai_deux_postes.ps1
#>
param(
    [string]$Admin = "C:\Users\MARCOM\AlgoPlanR-admin",
    [string]$Activation = "activation-drh-test.algoplanr-activation",
        [int]$PortDrh = 8101,
    [int]$PortDelegue = 8102,
    [switch]$Conserver
)

$ErrorActionPreference = "Stop"
$Backend = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Racine = Join-Path ([System.IO.Path]::GetTempPath()) ("algoplanr-deux-postes-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$Bilan = [System.Collections.Generic.List[string]]::new()

function Verifier([bool]$condition, [string]$libelle) {
    if (-not $condition) { throw "ÉCHEC : $libelle" }
    $Bilan.Add("OK  $libelle")
    Write-Host "OK  $libelle" -ForegroundColor Green
}

function Demarrer([string]$nom, [int]$port) {
    $dossier = Join-Path $Racine $nom
    New-Item -ItemType Directory -Force $dossier | Out-Null
    $env:ALGOPLANR_DATA_DIR = $dossier
    $env:ALGOPLANR_DB = Join-Path $dossier "algoplanr.sqlite3"
    $env:ALGOPLANR_JETON = ""
    $p = Start-Process -FilePath $Python -ArgumentList "-m", "algoplanr.serveur", "--port", $port `
        -WorkingDirectory $Backend -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $dossier "serveur.log") -RedirectStandardError (Join-Path $dossier "erreurs.log")
    for ($i = 0; $i -lt 120; $i++) {
        try { Invoke-RestMethod "http://127.0.0.1:$port/api/v1/sante/" | Out-Null; return @{ Processus = $p; Dossier = $dossier; Url = "http://127.0.0.1:$port/api/v1/" } }
        catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Le serveur $nom ne répond pas (voir $dossier\erreurs.log)"
}

function Appel($poste, [string]$methode, [string]$route, $corps = $null, [string]$jeton = $null, [hashtable]$formulaire = $null) {
    $entetes = @{}
    if ($jeton) { $entetes["Authorization"] = "Bearer $jeton" }
    $params = @{ Method = $methode; Uri = ($poste.Url + $route); Headers = $entetes; SkipHttpErrorCheck = $true; StatusCodeVariable = "statut" }
    if ($formulaire) { $params["Form"] = $formulaire }
    elseif ($null -ne $corps) { $params["Body"] = ($corps | ConvertTo-Json -Depth 6); $params["ContentType"] = "application/json; charset=utf-8" }
    $reponse = Invoke-RestMethod @params
    return @{ Statut = [int]$statut; Corps = $reponse }
}

function MotDePasse($poste, [string]$jeton, [string]$actuel, [string]$nouveau) {
    $r = Appel $poste POST "acces/mot-de-passe/" @{ actuel = $actuel; nouveau = $nouveau; confirmation = $nouveau } $jeton
    return $r
}

$drh = $null; $delegue = $null
try {
    New-Item -ItemType Directory -Force $Racine | Out-Null
    Write-Host "Dossiers des postes : $Racine"
    $drh = Demarrer "poste-drh" $PortDrh
    $delegue = Demarrer "poste-centre" $PortDelegue

    # --- 1. Poste du DRH ----------------------------------------------------------------------------------------
    $etat = (Appel $drh GET "acces/etat/").Corps
    Verifier (-not $etat.poste_active) "poste du DRH vierge au départ"
    $r = Appel $drh POST "acces/activation/" -formulaire @{ fichier = Get-Item (Join-Path $Admin $Activation) }
    Verifier ($r.Statut -eq 201) "activation du poste du DRH par fichier signé"
    $r = Appel $drh POST "acces/connexion/" @{ identifiant = "drh"; mot_de_passe = "123456" }
    Verifier ($r.Corps.session.portee -eq "CHANGEMENT_MDP") "première connexion du DRH : mot de passe à créer"
    $mdpDrh = "Poste-National-2026"
    $r = MotDePasse $drh $r.Corps.jeton "123456" $mdpDrh
    Verifier ($r.Statut -eq 200 -and $r.Corps.cle_secours) "mot de passe du DRH créé, codes embarqués installés, clé de secours affichée"
    $jetonDrh = $r.Corps.jeton
    $r = Appel $drh POST "acces/codes/remettre/" @{ region = "Centre"; usage = "activation"; mot_de_passe = $mdpDrh; remis_a = "Délégué du Centre" } $jetonDrh
    $codeActivation = $r.Corps.code
    Verifier ($codeActivation.Length -eq 8) "code d'activation du Centre remis ($($r.Corps.entree))"

    # --- 2. Poste du délégué : seul le code « dicté » passe d'un poste à l'autre ------------------------------
    $etat = (Appel $delegue GET "acces/etat/").Corps
    Verifier (-not $etat.poste_active -and $etat.poste -ne $null) "poste du délégué vierge, identifiant de poste propre"
    $r = Appel $delegue POST "acces/code/" @{ region = "Centre"; usage = "activation"; code = $codeActivation }
    Verifier ($r.Statut -eq 201 -and $r.Corps.session.portee -eq "CHANGEMENT_MDP") "code accepté hors ligne, mot de passe à créer"
    $r2 = Appel $delegue GET "jeux/" -jeton $r.Corps.jeton
    Verifier ($r2.Statut -eq 403) "aucune donnée avant la création du mot de passe"
    $mdpDelegue = "Region-Mfoundi-2026"
    $r = MotDePasse $delegue $r.Corps.jeton $codeActivation $mdpDelegue
    Verifier ($r.Statut -eq 200 -and $r.Corps.session.portee -eq "COMPLETE") "mot de passe personnel créé, session complète"
    $jetonDel = $r.Corps.jeton

    # --- 3. Code consommé, cloisonnement, aucun code en clair ------------------------------------------------
    $r = Appel $delegue POST "acces/code/" @{ region = "Centre"; usage = "activation"; code = $codeActivation }
    Verifier ($r.Statut -ne 201) "le code d'activation ne sert plus sur ce poste"
    $r = Appel $delegue POST "jeux/demonstration/" @{ nb_ecoles = 12; nb_enseignants = 60 } $jetonDel
    Verifier ($r.Statut -eq 201 -and $r.Corps.region -eq "Centre") "jeu créé sur le poste du délégué, région Centre imposée"
    $jeu = $r.Corps.id
    # Lecture partagée : la base est ouverte par le serveur.
    # Base et journal WAL (les écritures récentes peuvent y être encore).
    $base = ""
    foreach ($nom in "algoplanr.sqlite3", "algoplanr.sqlite3-wal") {
        $chemin = Join-Path $delegue.Dossier $nom
        if (-not (Test-Path $chemin)) { continue }
        $flux = [System.IO.File]::Open($chemin, "Open", "Read", "ReadWrite")
        try { $octets = [byte[]]::new($flux.Length); [void]$flux.Read($octets, 0, $octets.Length) } finally { $flux.Close() }
        $base += [System.Text.Encoding]::Latin1.GetString($octets)
    }
    Verifier (-not $base.Contains($codeActivation)) "aucun code en clair dans la base SQLite du délégué"
    $r = Appel $drh GET "jeux/" -jeton $jetonDrh
    Verifier (@($r.Corps).Count -eq 0) "le poste du DRH ignore tout du poste du délégué (aucun partage)"

    # --- 4. Récupération par code, sans perte de données ----------------------------------------------------
    $r = Appel $drh POST "acces/codes/remettre/" @{ region = "Centre"; usage = "recuperation"; mot_de_passe = $mdpDrh; remis_a = "Délégué du Centre" } $jetonDrh
    $codeRecup = $r.Corps.code
    $r = Appel $delegue POST "acces/code/" @{ region = "Centre"; usage = "recuperation"; code = $codeRecup }
    Verifier ($r.Statut -eq 201) "code de récupération accepté"
    $mdp2 = "Nouveau-Mfoundi-2027"
    $r = MotDePasse $delegue $r.Corps.jeton $codeRecup $mdp2
    Verifier ($r.Statut -eq 200) "nouveau mot de passe créé après récupération"
    $jetonDel = $r.Corps.jeton
    $r = Appel $delegue GET "jeux/$jeu/" -jeton $jetonDel
    Verifier ($r.Statut -eq 200) "le jeu du délégué est conservé après la récupération"
    $r = Appel $delegue POST "acces/code/" @{ region = "Centre"; usage = "recuperation"; code = $codeRecup }
    Verifier ($r.Statut -ne 201) "le code de récupération est à usage unique"

    # --- 5. Redémarrage du poste du délégué -------------------------------------------------------------------
    Stop-Process -Id $delegue.Processus.Id -Force
    Start-Sleep -Seconds 1
    $delegue = Demarrer "poste-centre" $PortDelegue
    $r = Appel $delegue POST "acces/connexion/" @{ identifiant = "delegue.centre"; mot_de_passe = $mdp2 }
    Verifier ($r.Statut -eq 201 -and $r.Corps.session.portee -eq "COMPLETE") "après redémarrage : connexion avec le mot de passe personnel"
    $r = Appel $delegue GET "jeux/" -jeton $r.Corps.jeton
    Verifier (@($r.Corps).Count -eq 1) "après redémarrage : le jeu est toujours là"

    Write-Host ""
    Write-Host "Scénario des deux postes autonomes : $($Bilan.Count) contrôle(s) réussi(s)." -ForegroundColor Green
}
finally {
    foreach ($p in @($drh, $delegue)) { if ($p -and -not $p.Processus.HasExited) { Stop-Process -Id $p.Processus.Id -Force } }
    Remove-Item Env:ALGOPLANR_DB, Env:ALGOPLANR_DATA_DIR -ErrorAction SilentlyContinue
    if (-not $Conserver) { Start-Sleep -Seconds 1; Remove-Item -Recurse -Force $Racine -ErrorAction SilentlyContinue }
}
