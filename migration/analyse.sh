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
sleep 5

# Tentative d'ouverture de la base ; si la version ODS est trop ancienne pour
# Firebird 2.5, essai avec Firebird 1.5 (rétro-compatible InterBase 5/6).
FIREBIRD_IN_CONTAINER="/database/$(basename "$FIRST_ITB")"
echo "=== 3/4 Test d'ouverture de la base (Firebird 2.5) ==="
if ! docker exec magicmed-firebird isql-fb -user SYSDBA -password masterkey \
     "$FIREBIRD_IN_CONTAINER" -e 'SELECT 1 FROM RDB$DATABASE;' 2>data/fb_err.txt; then
  echo "-- Firebird 2.5 refuse la base. Message : --"
  cat data/fb_err.txt
  echo "-- Essai avec Firebird 1.5 (rétro-compatible InterBase 5/6) --"
  $COMPOSE down
  sed 's|jacobalbano/firebird:2.5-ss|jacobalbano/firebird:1.5-ss|' docker-compose.yml > docker-compose.fb15.yml
  $COMPOSE -f docker-compose.fb15.yml up -d firebird
  sleep 5
  FIREBIRD_CMD="docker exec magicmed-firebird isql -user SYSDBA -password masterkey"
  if ! $FIREBIRD_CMD "$FIREBIRD_IN_CONTAINER" -e 'SELECT 1 FROM RDB$DATABASE;' 2>data/fb_err.txt; then
    echo "-- Firebird 1.5 refuse aussi la base. Message : --"
    cat data/fb_err.txt
    echo "Copiez toute la sortie et envoyez-la."
    exit 1
  fi
else
  FIREBIRD_CMD="docker exec magicmed-firebird isql-fb -user SYSDBA -password masterkey"
fi
echo "=== 4/4 Extraction du schéma (liste des tables) ==="
$FIREBIRD_CMD "$FIREBIRD_IN_CONTAINER" <<'SQL'
SET LIST ON;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
SQL

echo "=== Détail des colonnes par table ==="
$FIREBIRD_CMD "$FIREBIRD_IN_CONTAINER" <<'SQL'
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
