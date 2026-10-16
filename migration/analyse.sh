#!/bin/bash
# Analyse de la base MagicMed/MagicGed (.ITB) — étape 1 du kit de migration.
# Usage : ./analyse.sh  (les fichiers .ITB doivent être dans ./data/)
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 1/4 Vérification de l'en-tête du fichier ==="
FIRST_ITB=$(ls data/*.ITB data/*.itb 2>/dev/null | head -1 || true)
if [ -z "$FIRST_ITB" ]; then
  echo "ERREUR : aucun fichier .ITB trouvé dans ./data/"
  exit 1
fi
echo "Fichier analysé : $FIRST_ITB ($(du -h "$FIRST_ITB" | cut -f1))"
echo "--- Signature binaire (premiers 512 octets, affichés en texte) ---"
head -c 512 "$FIRST_ITB" | strings | head -20
echo "--- Page size / version (octets 0-100 en hexadécimal) ---"
xxd -l 128 "$FIRST_ITB" || hexdump -C -n 128 "$FIRST_ITB"

echo ""
echo "=== 2/4 Démarrage du serveur Firebird (Docker) ==="
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

# Découverte automatique du binaire isql dans le conteneur
ISQL_PATH=$(docker exec magicmed-firebird sh -c \
  'command -v isql || command -v isql-fb || ls /usr/bin/isql* /opt/firebird/bin/isql* 2>/dev/null | head -1' || true)
if [ -z "$ISQL_PATH" ]; then
  echo "ERREUR : binaire isql introuvable dans le conteneur. Diagnostic :"
  docker exec magicmed-firebird sh -c 'ls /usr/bin | grep -i -E "isql|firebird" ; ls /opt 2>/dev/null'
  exit 1
fi
echo "isql détecté dans le conteneur : $ISQL_PATH"

DB_IN_CONTAINER="/database/$(basename "$FIRST_ITB")"
echo "=== 3/4 Test d'ouverture de la base ==="
if ! docker exec magicmed-firebird "$ISQL_PATH" -user SYSDBA -password masterkey \
     "$DB_IN_CONTAINER" -e 'SELECT 1 FROM RDB$DATABASE;' 2>data/fb_err.txt; then
  echo "-- Échec de l'ouverture. Message de Firebird : --"
  cat data/fb_err.txt
  echo ""
  echo "-- Diagnostic complémentaire (version ODS lue dans l'en-tête) : --"
  docker exec magicmed-firebird sh -c "dd if=$DB_IN_CONTAINER bs=1 skip=0 count=4 2>/dev/null | od -A d -t u1"
  echo "Copiez toute la sortie et envoyez-la."
  exit 1
fi
echo "Ouverture OK — la base est lisible par Firebird 2.5."

FIREBIRD_CMD=(docker exec magicmed-firebird "$ISQL_PATH" -user SYSDBA -password masterkey)

echo "=== 4/4 Extraction du schéma (liste des tables) ==="
"${FIREBIRD_CMD[@]}" "$DB_IN_CONTAINER" <<'SQL'
SET LIST ON;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
SQL

echo "=== Détail des colonnes par table ==="
"${FIREBIRD_CMD[@]}" "$DB_IN_CONTAINER" <<'SQL'
SELECT r.RDB$RELATION_NAME AS TABLE_NAME,
       f.RDB$FIELD_NAME AS COLUMN_NAME,
       f.RDB$FIELD_ID AS POSITION
FROM RDB$RELATION_FIELDS f
JOIN RDB$RELATIONS r ON r.RDB$RELATION_NAME = f.RDB$RELATION_NAME
WHERE r.RDB$SYSTEM_FLAG = 0 AND r.RDB$VIEW_BLR IS NULL
ORDER BY 1, 3;
SQL

echo ""
echo "=== Terminé. Copiez TOUTE la sortie ci-dessus et envoyez-la. ==="
