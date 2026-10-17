#!/bin/bash
# Diagnostic : localiser isql dans le conteneur Firebird
set -uo pipefail
cd "$(dirname "$0")"

echo "--- 1. Shell disponible dans le conteneur ---"
docker exec magicmed-firebird sh -c 'echo OK' 2>&1 || \
  docker exec magicmed-firebird bash -c 'echo OK (bash)' 2>&1 || true

echo ""
echo "--- 2. Recherche isql sur tout le système de fichiers ---"
docker exec magicmed-firebird sh -c 'find / -name "isql*" 2>/dev/null | head' 2>&1 || true

echo ""
echo "--- 3. Répertoires standards ---"
docker exec magicmed-firebird sh -c 'echo /opt:; ls /opt 2>/dev/null; echo /usr/bin:; ls /usr/bin 2>/dev/null | head -30; echo /usr/local/bin:; ls /usr/local/bin 2>/dev/null' 2>&1 || true

echo ""
echo "--- 4. Racine ---"
docker exec magicmed-firebird sh -c 'ls /' 2>&1 || true

echo ""
echo "--- 5. Processus principal ---"
docker exec magicmed-firebird sh -c 'cat /proc/1/cmdline | tr "\0" " "; echo' 2>&1 || true
