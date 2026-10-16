#!/bin/bash
# Analyse de la base MagicMed/MagicGed (.ITB) — étape 1 du kit de migration.
# Usage : ./analyse.sh  (les fichiers .ITB doit être dans ./data/)
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 1/5 Vérification de l'en-tête du fichier ==="
FIRST_ITB=$(ls data/*.ITB data/*.itb 2>/dev/null | head -1 || true)
if [ -z "$FIRST_ITB" ]; then
  echo "ERREUR : aucun fichier .ITB trouvé dans ./data/"
  exit 1
fi
echo "Fichier analysé : $FIRST_ITB ($(du -h "$FIRST_ITB" | cut -f1))"

echo ""
echo "=== 2/5 Copie patchée de la base (rôle SYSDBA renommé) ==="
# La base MagicMed contient un rôle SQL nommé SYSDBA, en conflit avec
# l'utilisateur Firebird. On copie la base en renommant ce rôle en SYSDBX.
# La copie prend quelques minutes pour 3,4 Go — c'est normal.
ITB_PATCHE="$(dirname "$FIRST_ITB")/$(basename "$FIRST_ITB" | sed 's/\.[^.]*$//')-patched.itb"
if [ ! -f "$ITB_PATCHE" ]; then
  python3 patch_role.py "$FIRST_ITB" "$ITB_PATCHE"
fi
echo "Base patchée : $ITB_PATCHE ($(du -h "$ITB_PATCHE" | cut -f1))"

echo ""
echo "=== 3/5 Démarrage du serveur Firebird (Docker) ==="
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
  'command -v isql || command -v isql-fb || ls /usr/local/firebird/bin/isql* /opt/firebird/bin/isql* /usr/bin/isql* 2>/dev/null | head -1' || true)
if [ -z "$ISQL_PATH" ]; then
  echo "ERREUR : binaire isql introuvable dans le conteneur. Diagnostic :"
  docker exec magicmed-firebird sh -c 'ls /usr/bin | grep -i -E "isql|firebird" ; ls /opt 2>/dev/null'
  exit 1
fi
echo "isql détecté dans le conteneur : $ISQL_PATH"

DB_IN_CONTAINER="/database/$(basename "$ITB_PATCHE")"
echo ""
echo "=== 4/5 Test d'ouverture de la base patchée ==="
cat > /tmp/migration_test.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'SYSDBA' PASSWORD 'masterkey';
SELECT 1 FROM RDB\$DATABASE;
EOF
if ! docker exec -i magicmed-firebird "$ISQL_PATH" \
     -user SYSDBA -password masterkey < /tmp/migration_test.sql 2>data/fb_err.txt; then
  echo "-- Échec de l'ouverture. Message de Firebird : --"
  cat data/fb_err.txt
  echo "Copiez toute la sortie et envoyez-la."
  exit 1
fi
echo "Ouverture OK — la base patchée est lisible."

echo ""
echo "=== 5/5 Extraction du schéma (tables) ==="
cat > /tmp/migration_tables.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'SYSDBA' PASSWORD 'masterkey';
SET LIST ON;
SELECT RDB\$RELATION_NAME FROM RDB\$RELATIONS
 WHERE RDB\$SYSTEM_FLAG = 0 AND RDB\$VIEW_BLR IS NULL
 ORDER BY RDB\$RELATION_NAME;
EOF
docker exec -i magicmed-firebird "$ISQL_PATH" \
  -user SYSDBA -password masterkey < /tmp/migration_tables.sql

echo ""
echo "=== Détail des colonnes par table ==="
cat > /tmp/migration_columns.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'SYSDBA' PASSWORD 'masterkey';
SELECT r.RDB\$RELATION_NAME AS TABLE_NAME,
       f.RDB\$FIELD_NAME AS COLUMN_NAME,
       f.RDB\$FIELD_ID AS POSITION
FROM RDB\$RELATION_FIELDS f
JOIN RDB\$RELATIONS r ON r.RDB\$RELATION_NAME = f.RDB\$RELATION_NAME
WHERE r.RDB\$SYSTEM_FLAG = 0 AND r.RDB\$VIEW_BLR IS NULL
ORDER BY 1, 3;
EOF
docker exec -i magicmed-firebird "$ISQL_PATH" \
  -user SYSDBA -password masterkey < /tmp/migration_columns.sql

echo ""
echo "=== Terminé. Copiez TOUTE la sortie ci-dessus et envoyez-la. ==="
