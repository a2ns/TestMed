#!/usr/bin/env bash
# Création d'une VM UTM minimaliste pour l'image WinPE MagicMed (lecteur de
# carte Vitale + DLL FSV). La VM démarre directement sur l'ISO WinPE : pas
# d'installation Windows, pas de disque requis.
#
# Prérequis :
#   - UTM >= 4.10 installé (utmctl)
#   - ISO WinPE MagicMed généré par scripts/winpe/build-winpe.ps1 (hôte Windows ADK)

set -euo pipefail

ISO="${1:-$HOME/Downloads/winpe-magicmed.iso}"
VM_NAME="MagicMed-WinPE"

if [ ! -f "$ISO" ]; then
  echo "ISO WinPE introuvable : $ISO"
  echo "Usage : $0 <chemin/winpe-magicmed.iso>"
  echo "Générer l'ISO avec scripts/winpe/build-winpe.ps1 sur un hôte Windows (ADK + WinPE add-on)."
  exit 1
fi

command -v utmctl >/dev/null || {
  echo "utmctl indisponible. Installer UTM >= 4.10 : https://mac.getutm.app"
  exit 1
}

osascript <<EOF
tell application "UTM" to activate
display dialog ¬
  "Création de la VM WinPE MagicMed dans UTM. Étapes :\n\n" & ¬
  "1. Nouvelle VM → Emulate\n" & ¬
  "2. Système : Windows (ISO $ISO monté comme disque de démarrage)\n" & ¬
  "3. Architecture : x86_64 (ou ARM64 si l'ISO a été construit en arm64)\n" & ¬
  "4. 2 vCPU, 2048 Mo — WinPE est minimaliste\n" & ¬
  "5. Pas de disque requis : WinPE vit en RAM\n" & ¬
  "6. Nommer exactement : $VM_NAME\n" & ¬
  "7. Démarrer, brancher le lecteur Vitale, le cocher dans la barre USB de la VM." with title "MagicMed - VM WinPE UTM"
EOF

echo "VM à créer (nom : $VM_NAME). Démarrage une fois créée :"
echo "  utmctl start $VM_NAME"
echo "Au boot, l'image lance automatiquement X:\\MagicMed\\configurer-poste-winpe.ps1"
echo "Test manuel : powershell -File X:\\MagicMed\\test-lecteur.ps1"
