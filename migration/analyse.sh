#!/bin/bash
# Analyse de la base MagicMed/MagicGed (.ITB) — étape 1 du kit de migration.
# Usage : ./analyse.sh  (le fichier .ITB doit être dans ./data/)
# Firebird 1.5 : pas de vérification de conflit rôle/utilisateur SYSDBA
# (introduite en Firebird 2.1+), donc la base s'ouvre directement.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 1/4 Vérification de l'en-tête du fichier ==="
FIRST_ITB=$(ls data/*.ITB data/*.itb 2>/dev/null | head -1 || true)
if [ -z "$FIRST_ITB" ]; then
  echo "ERREUR : aucun fichier .ITB trouvé dans ./data/"
  exit 1
fi
echo "Fichier analysé : $FIRST_ITB ($(du -h "$FIRST_ITB" | cut -f1))"

echo ""
echo "=== 2/4 Démarrage du serveur Firebird 1.5 (Docker) ==="
COMPOSE=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "ERREUR : docker-compose introuvable. Installez-le avec :"
  echo "  brew install docker-compose"
  exit 1
fi
echo "Utilisation de : $COMPOSE"
$COMPOSE up -d firebird
sleep 8

ISQL_PATH=$(docker exec magicmed-firebird sh -c \
  'command -v isql || command -v isql-fb || ls /opt/firebird/bin/isql* /usr/local/firebird/bin/isql* /usr/bin/isql* 2>/dev/null | head -1' || true)
if [ -z "$ISQL_PATH" ]; then
  echo "ERREUR : binaire isql introuvable dans le conteneur. Diagnostic :"
  docker exec magicmed-firebird sh -c 'find / -name "isql*" -not -path "/proc/*" 2>/dev/null | head -5; ls /opt 2>/dev/null'
  exit 1
fi
echo "isql détecté dans le conteneur : $ISQL_PATH"

DB_IN_CONTAINER="/data/$(basename "$FIRST_ITB")"
echo ""
echo "=== 3/4 Test d'ouverture de la base ==="
cat > /tmp/migration_test.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'SYSDBA' PASSWORD 'masterkey';
SELECT 1 FROM RDB\$DATABASE;
EOF
if ! docker exec -i magicmed-firebird "$ISQL_PATH" < /tmp/migration_test.sql 2>data/fb_err.txt; then
  echo "-- Échec de l'ouverture. Message de Firebird : --"
  cat data/fb_err.txt
  echo "Copiez toute la sortie et envoyez-la."
  exit 1
fi
grep -q "Statement failed" data/fb_err.txt && { echo "Échec silencieux, voir data/fb_err.txt"; cat data/fb_err.txt; exit 1; } || true
echo "Ouverture OK — la base est lisible par Firebird 1.5."

echo ""
echo "=== 4/4 Extraction du schéma (tables + colonnes) ==="
cat > /tmp/migration_schema.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'SYSDBA' PASSWORD 'masterkey';
SET LIST ON;
SELECT RDB\$RELATION_NAME AS TABLE_NAME FROM RDB\$RELATIONS
 WHERE RDB\$SYSTEM_FLAG = 0 AND RDB\$VIEW_BLR IS NULL
 ORDER BY RDB\$RELATION_NAME;
SELECT r.RDB\$RELATION_NAME AS TABLE_NAME,
       f.RDB\$FIELD_NAME AS COLUMN_NAME,
       f.RDB\$FIELD_ID AS POSITION
FROM RDB\$RELATION_FIELDS f
JOIN RDB\$RELATIONS r ON r.RDB\$RELATION_NAME = f.RDB\$RELATION_NAME
WHERE r.RDB\$SYSTEM_FLAG = 0 AND r.RDB\$VIEW_BLR IS NULL
ORDER BY 1, 3;
EOF
docker exec -i magicmed-firebird "$ISQL_PATH" < /tmp/migration_schema.sql

echo ""
echo "=== Terminé. Copiez TOUTE la sortie ci-dessus et envoyez-la. ==="
