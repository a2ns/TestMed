# Configuration de l'environnement WinPE MagicMed : démarre le support carte à
# puce (PC/SC), vérifie le lecteur de carte Vitale et la DLL FSV sgpv.dll.
# Appelé automatiquement par startnet.cmd au démarrage de l'image WinPE.

$ErrorActionPreference = "Continue"

Write-Host "===== MagicMed - poste Sesam-Vitale (WinPE) =====" -ForegroundColor Cyan

# 1. Service carte à puce (SCardSvr) : copié dans l'image par build-winpe.ps1
Write-Host "Démarrage du service carte à puce (SCardSvr)..."
$scard = Get-Service -Name SCardSvr -ErrorAction SilentlyContinue
if (-not $scard) {
    # Sur WinPE le service n'est pas toujours pré-registré : inscription minimale
    sc.exe create SCardSvr binPath= "C:\Windows\System32\SCardSvr.exe" start= demand | Out-Null
    sc.exe start SCardSvr | Out-Null
} else {
    Start-Service -Name SCardSvr -ErrorAction SilentlyContinue
}

# 2. Vérification du lecteur
Start-Sleep -Seconds 2
$lecteur = Get-PnpDevice -Class SmartCardReader -ErrorAction SilentlyContinue | Where-Object Status -eq "OK"
if ($lecteur) {
    Write-Host "Lecteur détecté : $($lecteur.FriendlyName)" -ForegroundColor Green
    $lecteur | ForEach-Object { Write-Host "  - $($_.FriendlyName) [$($_.InstanceId)]" }
} else {
    Write-Warning "Aucun lecteur SmartCard détecté."
    Write-Host "  - Vérifier le branchement USB et le partage USB dans UTM."
}

# 3. DLL FSV
$sgpv = "X:\MagicMed\sgpv.dll"
if (Test-Path $sgpv) {
    Write-Host "DLL FSV présente : $sgpv" -ForegroundColor Green
} else {
    Write-Warning "sgpv.dll absente de X:\MagicMed — la lecture Vitale ne fonctionnera pas."
}

Write-Host "===== Environnement prêt. Shell interactif disponible. =====" -ForegroundColor Cyan
Write-Host "Test manuel : powershell -File X:\MagicMed\test-lecteur.ps1"
