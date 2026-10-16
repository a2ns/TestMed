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
docker compose up -d firebird
sleep 5

echo "=== 3/4 Connexion à la base et extraction du schéma ==="
FIREBIRD_IN_CONTAINER="/database/$(basename "$FIRST_ITB")"
docker exec magicmed-firebird isql-fb -user SYSDBA -password masterkey \
  "$FIREBIRD_IN_CONTAINER" <<'SQL'
SET LIST ON;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
SQL

echo "=== 4/4 Détail des colonnes par table ==="
docker exec magicmed-firebird isql-fb -user SYSDBA -password masterkey \
  "$FIREBIRD_IN_CONTAINER" <<'SQL'
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
