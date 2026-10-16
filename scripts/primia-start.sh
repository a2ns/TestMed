#!/usr/bin/env bash
# Primia — démarrage des services (base, IA) puis de l'application
# Usage : ./scripts/primia-start.sh
set -uo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

echo "🩺 Primia — démarrage"

# 1. PostgreSQL
if ! brew services list 2>/dev/null | grep -q "postgresql@16.*started"; then
  brew services start postgresql@16 >/dev/null 2>&1
  sleep 2
  echo "✓ PostgreSQL démarré"
else
  echo "• PostgreSQL déjà actif"
fi

# 2. Ollama (si configuré en local)
if grep -q "^AI_BASE_URL=http://localhost:11434" .env 2>/dev/null; then
  if ! pgrep -x "ollama" >/dev/null 2>&1; then
    brew services start ollama >/dev/null 2>&1 || (ollama serve >/dev/null 2>&1 &)
    sleep 2
    echo "✓ Ollama démarré (le modèle se chargera à la première utilisation)"
  else
    echo "• Ollama déjà actif"
  fi
fi

# 3. Application Primia
echo "🚀 Lancement de Primia (première compilation de la session : quelques minutes)…"
cd "$REPO_ROOT/apps/desktop"
npm run tauri dev
