#!/usr/bin/env bash
# Création d'une VM Windows 11 ARM64 pour UTM (macOS, Apple Silicon) destinée
# à MagicMed avec support USB (lecteur de carte Vitale).
#
# Prérequis :
#   - UTM >= 4.10 installé (utmq disponible)
#   - ISO Windows 11 ARM64 légitime obtenu auprès de Microsoft
#     (https://www.microsoft.com/software-download/windowsinsiderpreviewARM64)

set -euo pipefail

ISO="${1:-$HOME/Downloads/Win11_ARM64.iso}"
DISK_GB="${2:-64}"
VM_NAME="MagicMed-Windows"

if [ ! -f "$ISO" ]; then
  echo "ISO Windows introuvable : $ISO"
  echo "Usage : $0 <chemin/Win11_ARM64.iso> [taille_disque_GB]"
  exit 1
fi

command -v utmctl >/dev/null || {
  echo "utmctl indisponible. Installer UTM >= 4.10 : https://mac.getutm.app"
  exit 1
}

# utmctl ne crée pas encore de VM de zéro ; on pilote UTM via AppleScript
# minimal (assistant "Create a New VM" type VM) puis on renomme.
osascript <<EOF
tell application "UTM" to activate
display dialog ¬
  "La création de VM doit passer par l'assistant UTM. Étapes guidées :\n\n" & ¬
  "1. Nouvelle VM → Virtualize → Microsoft Windows\n" & ¬
  "2. Sélectionner l'ISO : $ISO\n" & ¬
  "3. Architecture : ARM64 (aarch64), 4 vCPU, 4096 Mo\n" & ¬
  "4. Disque : ${DISK_GB} Go\n" & ¬
  "5. Nommer la VM exactement : $VM_NAME\n" & ¬
  "6. Après installation : partager le dossier MagicMed et brancher le lecteur Vitale (barre USB)." with title "MagicMed - création VM UTM"
EOF

echo "Une fois la VM créée dans UTM (nom exact : $VM_NAME), démarrage :"
echo "  utmctl start $VM_NAME"
echo "Puis dans la VM (PowerShell admin) :"
echo "  powershell -ExecutionPolicy Bypass -File scripts/utm/configurer-poste-windows.ps1 -Dev"
