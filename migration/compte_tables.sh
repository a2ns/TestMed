#!/bin/bash
# Compte les lignes de toutes les tables MagicMed (non système).
set -uo pipefail
cd "$(dirname "$0")"

ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
[ -z "$ITB" ] && { echo "ERREUR : aucun .ITB dans ./data/"; exit 1; }
DB="/database/$(basename "$ITB")"
echo "Base : $DB"
docker ps --format '{{.Names}}' | grep -q magicmed-firebird || { echo "ERREUR : conteneur magicmed-firebird absent"; exit 1; }

# Liste des tables
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" 2>&1 <<'EOF' | grep -E '^[A-Z]' | tr -d ' \r' > /tmp/tables_list.txt
SET HEADING OFF;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
EOF

NB=$(grep -c . /tmp/tables_list.txt || true)
echo "Tables détectées : $NB"
[ "$NB" -lt 5 ] && { cat /tmp/tables_list.txt; exit 1; }

echo "Comptage..."
while IFS= read -r t; do
  [ -z "$t" ] && continue
  # COUNT sur une ligne : sortie brute isql -> dernier champ numérique
  OUT=$(docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
    -user SYSDBA -password masterkey "$DB" 2>&1 <<< "SELECT COUNT(*) FROM $t;")
  # prendre la dernière ligne ne contenant QUE des chiffres/espaces
  C=$(echo "$OUT" | grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' | tail -1 | tr -d ' ')
  printf "%-28s %s\n" "$t" "${C:-?}"
done < /tmp/tables_list.txt
