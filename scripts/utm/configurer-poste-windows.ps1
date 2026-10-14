# Configuration du poste Windows (dans la VM UTM) pour MagicMed / Sesam-Vitale.
# À exécuter en administrateur dans PowerShell.
#
# Rôles :
#   - Vérifie la présence du lecteur de carte Vitale (USB/PC/SC)
#   - Installe la FSV (sgpv.dll) si un installeur est fourni
#   - En dev : installe le mock sgpv.dll pour tester sans matériel
#   - Crée les variables d'environnement MagicMed

param(
    [string]$FsvInstalleur = "",          # chemin vers l'installeur FSV du GIE (MSI/EXE)
    [string]$DllMock = "",               # chemin vers sgpv.dll mock (dev)
    [switch]$Dev                          # mode dev : tolère l'absence de matériel
)

$ErrorActionPreference = "Stop"
$InstallDir = "C:\Program Files\MagicMed"
$FsvDir = "C:\Program Files (x86)\Sesam Vitale\fsv"

function Test-LecteurVitale {
    Get-PnpDevice -Class SmartCardReader -ErrorAction SilentlyContinue |
        Where-Object Status -eq "OK" | Select-Object -First 1
}

Write-Host "== Configuration poste MagicMed / Sesam-Vitale =="

# 1. Lecteur de carte
$lecteur = Test-LecteurVitale
if ($lecteur) {
    Write-Host "Lecteur détecté : $($lecteur.FriendlyName)" -ForegroundColor Green
} elseif ($Dev) {
    Write-Warning "Aucun lecteur détecté (mode dev) : la lecture Vitale échouera proprement."
} else {
    throw "Aucun lecteur de carte détecté. Brancher le lecteur et cocher l'appareil USB dans UTM."
}

# 2. Service carte à puce (prérequis CPS/Vitale)
$scardsvr = Get-Service -Name SCardSvr -ErrorAction SilentlyContinue
if ($scardsvr -and $scardsvr.Status -ne "Running") {
    Set-Service -Name SCardSvr -StartupType Automatic
    Start-Service -Name SCardSvr
    Write-Host "Service SCardSvr démarré." -ForegroundColor Green
}

# 3. FSV réelle (production) ou mock (dev)
if ($FsvInstalleur -ne "" -and (Test-Path $FsvInstalleur)) {
    Write-Host "Installation de la FSV : $FsvInstalleur"
    Start-Process -FilePath $FsvInstalleur -ArgumentList "/quiet /norestart" -Wait
    if (-not (Test-Path "$FsvDir\sgpv.dll")) {
        throw "sgpv.dll attendu dans $FsvDir après installation FSV."
    }
} elseif ($DllMock -ne "" -and (Test-Path $DllMock)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Copy-Item $DllMock -Destination "$InstallDir\sgpv.dll" -Force
    Write-Host "Mock sgpv.dll installé dans $InstallDir (dev uniquement)." -ForegroundColor Yellow
} elseif (-not $Dev) {
    throw "Fournir -FsvInstalleur (production) ou -DllMock (dev)."
}

# 4. Environnement MagicMed
[Environment]::SetEnvironmentVariable("MAGICMED_DOCS_DIR", "$InstallDir\documents", "Machine")
[Environment]::SetEnvironmentVariable("MAGICMED_SGPV_PATH", "$InstallDir", "Machine")
New-Item -ItemType Directory -Force -Path "$InstallDir\documents" | Out-Null

Write-Host "== Terminé. Redémarrer la VM pour appliquer les variables d'environnement. =="
