#!/bin/bash
# Analyse de la base MagicMed/MagicGed (.ITB) — étape 1 du kit de migration.
# Usage : ./analyse.sh  (le fichier .ITB doit être dans ./data/)
# ODS détectée : 11.0 (Firebird 2.0). Firebird 2.5 la lit.
# Conflit rôle/utilisateur SYSDBA contourné via un compte Firebird dédié.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 1/5 Vérification du fichier ==="
FIRST_ITB=$(ls data/*.ITB data/*.itb 2>/dev/null | head -1 || true)
if [ -z "$FIRST_ITB" ]; then
  echo "ERREUR : aucun fichier .ITB trouvé dans ./data/"
  exit 1
fi
echo "Fichier analysé : $FIRST_ITB ($(du -h "$FIRST_ITB" | cut -f1))"
echo "Version ODS du fichier (octets 16-17, little-endian) :"
od -A d -t u1 -j 16 -N 2 "$FIRST_ITB"

echo ""
echo "=== 2/5 Démarrage du serveur Firebird 2.5 (Docker) ==="
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
  'command -v isql || command -v isql-fb || ls /usr/local/firebird/bin/isql* /opt/firebird/bin/isql* 2>/dev/null | head -1' || true)
if [ -z "$ISQL_PATH" ]; then
  echo "ERREUR : binaire isql introuvable dans le conteneur."
  exit 1
fi
echo "isql détecté dans le conteneur : $ISQL_PATH"

echo ""
echo "=== 3/5 Création d'un compte Firebird dédié (contourne le conflit SYSDBA) ==="
# La base contient un rôle SQL nommé SYSDBA. En se connectant avec un autre
# utilisateur (PRIMIA), le conflit disparaît.
docker exec magicmed-firebird /usr/local/firebird/bin/gsec -user SYSDBA -password masterkey \
  -add primia -pw primia123 || echo "(compte peut-être déjà créé : OK)"

DB_IN_CONTAINER="/database/$(basename "$FIRST_ITB")"
echo ""
echo "=== 4/5 Test d'ouverture de la base ==="
cat > /tmp/migration_test.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'PRIMIA' PASSWORD 'primia123';
SELECT 1 FROM RDB\$DATABASE;
EOF
if ! docker exec -i magicmed-firebird "$ISQL_PATH" < /tmp/migration_test.sql 2>data/fb_err.txt; then
  echo "-- Échec de l'ouverture. Message de Firebird : --"
  cat data/fb_err.txt
  echo "Copiez toute la sortie et envoyez-la."
  exit 1
fi
echo "Ouverture OK."

echo ""
echo "=== 5/5 Extraction du schéma (tables + colonnes) ==="
cat > /tmp/migration_schema.sql <<EOF
CONNECT '$DB_IN_CONTAINER' USER 'PRIMIA' PASSWORD 'primia123';
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
