#!/bin/bash
# Compte les lignes de toutes les tables MagicMed (non système).
set -uo pipefail
cd "$(dirname "$0")"

ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
[ -z "$ITB" ] && { echo "ERREUR : aucun .ITB dans ./data/"; exit 1; }
DB="/database/$(basename "$ITB")"
echo "Base : $DB"
docker ps --format '{{.Names}}' | grep -q magicmed-firebird || { echo "ERREUR : conteneur magicmed-firebird absent"; exit 1; }

# Liste des tables (une par ligne, sortie brute isql nettoyée)
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF' 2>&1 | grep -v "^$" > /tmp/tables_list.txt
SET HEADING OFF;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
EOF

NB=$(grep -c . /tmp/tables_list.txt || true)
echo "Tables détectées : $NB"
if [ "$NB" -lt 5 ]; then
  echo "Liste anormale — contenu brut :"
  cat /tmp/tables_list.txt
  exit 1
fi

echo "Comptage (une ligne par table, quelques minutes)..."
while IFS= read -r t; do
  t=$(echo "$t" | tr -d ' \r')
  [ -z "$t" ] && continue
  SQL="SELECT COUNT(*) AS N FROM $t;"
  COUNT=$(docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
    -user SYSDBA -password masterkey "$DB" 2>/dev/null <<< "$SQL" \
    | awk '/^ *N/{getline; print; exit}')
  printf "%-28s %s\n" "$t" "$COUNT"
done < /tmp/tables_list.txt
