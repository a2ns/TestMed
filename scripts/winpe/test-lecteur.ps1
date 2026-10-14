# Test rapide du lecteur de carte Vitale dans WinPE : énumération PC/SC et
# tentative de lecture de la carte via la DLL FSV (sgpv.dll).
# Usage : powershell -File X:\MagicMed\test-lecteur.ps1

$ErrorActionPreference = "Continue"
$sgpv = "X:\MagicMed\sgpv.dll"

Write-Host "=== Test lecteur Vitale (WinPE) ==="

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SgpvTest {
    [DllImport("X:\\MagicMed\\sgpv.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern ushort SGPV_OuvrirSession(out IntPtr h, string resource, ushort mode);
    [DllImport("X:\\MagicMed\\sgpv.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern ushort SGPV_LireVitale(IntPtr h, byte[] buf, ref uint taille);
    [DllImport("X:\\MagicMed\\sgpv.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern ushort SGPV_FermerSession(IntPtr h);
}
"@

if (-not (Test-Path $sgpv)) {
    Write-Host "sgpv.dll introuvable : $sgpv" -ForegroundColor Red
    exit 1
}

$h = [IntPtr]::Zero
$code = [SgpvTest]::SGPV_OuvrirSession([ref]$h, $null, 0)
if ($code -ne 0) {
    Write-Host "SGPV_OuvrirSession a échoué (code $code) — lecteur ou carte absente." -ForegroundColor Red
    exit 1
}

$buf = New-Object byte[] 8192
$taille = [uint32]$buf.Length
$code = [SgpvTest]::SGPV_LireVitale($h, $buf, [ref]$taille)
[SgpvTest]::SGPV_FermerSession($h) | Out-Null

if ($code -ne 0) {
    Write-Host "SGPV_LireVitale a échoué (code $code)." -ForegroundColor Red
    exit 1
}

$flux = [System.Text.Encoding]::UTF8.GetString($buf, 0, $taille)
Write-Host "Flux B2 brut : $flux" -ForegroundColor Green
