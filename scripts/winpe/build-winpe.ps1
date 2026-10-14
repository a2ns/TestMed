# Construit une image WinPE (x64 ou ARM64) incluant le support carte à puce
# (PC/SC) et la DLL FSV `sgpv.dll`, pour exécuter le lecteur de carte Vitale
# dans une VM UTM minimaliste.
#
# À exécuter sur un poste Windows avec le Windows ADK + le module
# "Windows PE add-on" installés (https://learn.microsoft.com/windows/hardware/get-started/adk-install).
#
# Usage (PowerShell administrateur, hôte Windows avec ADK) :
#   powershell -ExecutionPolicy Bypass -File build-winpe.ps1 -Arch amd64 -SgpvDll C:\chemin\sgpv.dll -IsoSortie C:\chemin\winpe-magicmed.iso

param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64",
    [string]$SgpvDll = "",
    [string]$RepTravail = "C:\WinPE_MagicMed",
    [string]$IsoSortie = "C:\WinPE_MagicMed\winpe-magicmed.iso"
)

$ErrorActionPreference = "Stop"

if ($SgpvDll -eq "" -or -not (Test-Path $SgpvDll)) {
    throw "Fournir -SgpvDll (DLL FSV réelle en production, ou le mock sgpv-mock en dev)."
}

$AdkPe = "C:\Program Files (x86)\Windows Kits\10\Assessment and Deployment Kit\Windows Preinstallation Environment"
if (-not (Test-Path $AdkPe)) {
    throw "Windows ADK + WinPE add-on introuvables. Installer depuis learn.microsoft.com/windows/hardware/get-started/adk-install"
}

Write-Host "== 1. Espace de travail WinPE ($Arch) =="
if (Test-Path $RepTravail) { Remove-Item $RepTravail -Recurse -Force }
$env:WinPERoot = "$AdkPe\${Arch}\Media"
$env:Path = "$AdkPe\${Arch};$AdkPe\Deployment Tools;" + $env:Path
# copype.cmd copie l'image WinPE dans le répertoire de travail
& copype.cmd $Arch $RepTravail
if ($LASTEXITCODE -ne 0) { throw "copype.cmd a échoué." }

Write-Host "== 2. Montage de l'image boot.wim =="
Dism /Mount-Image /ImageFile:"$RepTravail\media\sources\boot.wim" /Index:1 /MountDir:"$RepTravail\mount"
if ($LASTEXITCODE -ne 0) { throw "Montage de boot.wim échoué." }

Write-Host "== 3. Packages WinPE requis (WMI, script PowerShell, réseau) =="
$Pkgs = "$AdkPe\${Arch}\WinPE_OCs"
foreach ($oc in @("WinPE-WMI.cab", "WinPE-NetFX.cab", "WinPE-Scripting.cab", "WinPE-PowerShell.cab", "WinPE-HTA.cab")) {
    Dism /Add-Package /Image:"$RepTravail\mount" /PackagePath:"$Pkgs\$oc"
    if ($LASTEXITCODE -ne 0) { throw "Ajout du package $oc échoué." }
}

Write-Host "== 4. Support carte à puce (PC/SC) =="
# WinPE n'embarque pas le service carte à puce : on copie SCardSvr et ses
# dépendances depuis l'image hôte, puis on les enregistre au démarrage.
$Pcsc = "$RepTravail\mount\Windows\System32"
Copy-Item "$env:SystemRoot\System32\SCardSvr.exe" "$Pcsc\" -Force
foreach ($dll in @("WinSCard.dll", "WinSCard.dll.mui", "SCardDlg.dll")) {
    if (Test-Path "$env:SystemRoot\System32\$dll") {
        Copy-Item "$env:SystemRoot\System32\$dll" "$Pcsc\" -Force
    }
}
# Le lecteur Vitale USB : son driver doit être injecté ici
if (Test-Path "$PSScriptRoot\driver-lecteur") {
    Dism /Add-Driver /Image:"$RepTravail\mount" /Driver:"$PSScriptRoot\driver-lecteur" /Recurse
    if ($LASTEXITCODE -ne 0) { throw "Injection du driver lecteur échouée." }
}

Write-Host "== 5. DLL FSV (sgpv.dll) + scripts MagicMed =="
New-Item -ItemType Directory -Force -Path "$RepTravail\mount\MagicMed" | Out-Null
Copy-Item $SgpvDll "$RepTravail\mount\MagicMed\sgpv.dll" -Force
Copy-Item "$PSScriptRoot\configurer-poste-winpe.ps1" "$RepTravail\mount\MagicMed\" -Force
Copy-Item "$PSScriptRoot\test-lecteur.ps1" "$RepTravail\mount\MagicMed\" -Force

Write-Host "== 6. Script de démarrage : lance la config puis un shell =="
$Demarrage = @'
wpeinit
powershell.exe -ExecutionPolicy Bypass -File X:\MagicMed\configurer-poste-winpe.ps1
'@
Set-Content -Path "$RepTravail\mount\Windows\System32\startnet.cmd" -Value $Demarrage -Encoding Ascii

Write-Host "== 7. Commit + génération ISO =="
Dism /Unmount-Image /MountDir:"$RepTravail\mount" /Commit
if ($LASTEXITCODE -ne 0) { throw "Commit de boot.wim échoué." }
New-Item -ItemType Directory -Force -Path (Split-Path $IsoSortie) | Out-Null
& MakeWinPEMedia /ISO "$RepTravail\media" $IsoSortie 2>$null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $IsoSortie)) {
    # MakeWinPEMedia échoue parfois hors invite ADK ; fallback oscdimg
    $Oscdimg = "$AdkPe\${Arch}\Oscdimg\oscdimg.exe"
    if (-not (Test-Path $Oscdimg)) { $Oscdimg = "$AdkPe\Deployment Tools\amd64\Oscdimg\oscdimg.exe" }
    & $Oscdimg -n -b"$RepTravail\fwfiles\etfsboot.com" "$RepTravail\media" $IsoSortie
    if ($LASTEXITCODE -ne 0) { throw "Génération ISO échouée (copype/oscdimg)." }
}

Write-Host "== ISO WinPE généré : $IsoSortie ==" -ForegroundColor Green
Write-Host "VM UTM : créer une VM 'Emulate' x86_64 (ou ARM64 si $Arch = arm64) avec cette ISO en disque de démarrage."
