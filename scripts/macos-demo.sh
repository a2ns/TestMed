#!/usr/bin/env bash
# MagicMed v2 — démarrage express sur macOS (mode démo/développement)
# Usage : ./scripts/macos-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🩺 MagicMed v2 — démarrage express macOS"

# 1. Homebrew
if ! command -v brew >/dev/null; then
  echo "📦 Installation de Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
fi

# 2. Prérequis
echo "📦 Vérification des prérequis (rust, node, tesseract, sane, postgres)…"
brew list --versions rust node tesseract tesseract-lang sane-backends postgresql@16 >/dev/null 2>&1 || \
  brew install rust node tesseract tesseract-lang sane-backends postgresql@16

# PostgreSQL local (démo) — démarre s'il n'est pas déjà lancé
if ! brew services list 2>/dev/null | grep -q "postgresql@16.*started"; then
  echo "🐘 Démarrage de PostgreSQL…"
  brew services start postgresql@16
  sleep 3
  # Base + utilisateur de démo (ignore si déjà créés)
  createdb magicmed 2>/dev/null || true
  psql -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname='magicmed'" 2>/dev/null | grep -q 1 || \
    psql -d postgres -c "CREATE USER magicmed WITH PASSWORD 'magicmed' CREATEDB;"
  psql -d magicmed -c "SELECT 1 FROM pg_roles WHERE rolname='magicmed'" >/dev/null 2>&1 || true
fi

# 3. Environnement du poste (créé s'il n'existe pas)
if [ ! -f .env ]; then
  echo "🔑 Création du .env local (clé de démonstration)…"
  cat > .env <<EOF
DATABASE_URL=postgresql://$(whoami)@localhost:5432/magicmed
AI_BASE_URL=https://api.mistral.ai/v1
AI_MODEL=mistral-small-latest
AI_API_KEY=
MAGICMED_CLE_MASTER=$(openssl rand -base64 32)
MAGICMED_SAUVEGARDE_DOSSIER=$HOME/MagicMed-backups
MAGICMED_SAUVEGARDE_RETENTION=30
EOF
  echo "⚠️  Pour activer l'assistant IA : renseignez AI_API_KEY dans .env"
  echo "   (ou passez sur Ollama local : AI_BASE_URL=http://localhost:11434/v1)"
fi

# 4. Schéma + compte admin
echo "🗄️  Initialisation du schéma et du compte admin…"
cd packages/db
npm install
npx prisma db push
npm run seed

# 5. Lancement de l'application
echo "🚀 Lancement de MagicMed (première compilation : quelques minutes)…"
cd ../apps/desktop
npm install
npm run tauri dev
