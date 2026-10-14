#!/usr/bin/env bash
# Primia — arrêt propre des services (IA, base, application)
# Usage : ./scripts/primia-stop.sh [--tout] [--force]
set -uo pipefail

TOUT=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --tout)  TOUT=1 ;;
    --force) FORCE=1 ;;
  esac
done

echo "🩹 Primia — arrêt des services"

# 1. Application Primia (fenêtre Tauri)
if pgrep -f "primia-desktop" >/dev/null 2>&1; then
  pkill -f "primia-desktop" 2>/dev/null || true
  echo "✓ Primia (application) arrêtée"
else
  echo "• Primia n'était pas lancée"
fi

# 2. Ollama (l'IA — le gros consommateur de RAM)
if pgrep -x "ollama" >/dev/null 2>&1 || pgrep -x "ollama-runner" >/dev/null 2>&1; then
  # Décharge le modèle immédiatement, puis arrête le service.
  command -v ollama >/dev/null 2>&1 && ollama stop mistral 2>/dev/null || true
  if brew services list 2>/dev/null | grep -q "ollama.*started"; then
    brew services stop ollama >/dev/null 2>&1
    echo "✓ Ollama arrêté (service + modèle, RAM libérée)"
  else
    pkill -x "ollama" 2>/dev/null || true
    pkill -x "ollama-runner" 2>/dev/null || true
    echo "✓ Ollama arrêté (process, RAM libérée)"
  fi
else
  echo "• Ollama n'était pas lancé"
fi

# 3. PostgreSQL — optionnel : léger au repos, s'arrête seulement
#    avec --tout (ou --force si vous voulez tout couper systématiquement).
if [[ $TOUT -eq 1 || $FORCE -eq 1 ]]; then
  if brew services list 2>/dev/null | grep -q "postgresql@16.*started"; then
    brew services stop postgresql@16 >/dev/null 2>&1
    echo "✓ PostgreSQL arrêté"
  else
    echo "• PostgreSQL n'était pas lancé"
  fi
else
  if brew services list 2>/dev/null | grep -q "postgresql@16.*started"; then
    echo "• PostgreSQL laissé actif (léger au repos) — utilisez --tout pour l'arrêter aussi"
  fi
fi

echo "🩹 Arrêt terminé."
if [[ $TOUT -eq 0 && $FORCE -eq 0 ]]; then
  echo "  Astuce : --tout arrête aussi PostgreSQL ; --force impose l'arrêt complet."
fi
