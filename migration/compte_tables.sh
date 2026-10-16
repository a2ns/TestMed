#!/bin/bash
# Compte les lignes de toutes les tables MagicMed (non système) pour localiser
# où vivent les données (ex : les textes de consultations introuvables).
set -euo pipefail
cd "$(dirname "$0")"

ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
[ -z "$ITB" ] && { echo "ERREUR : aucun .ITB dans ./data/"; exit 1; }
DB="/database/$(basename "$ITB")"

# Récupérer la liste des tables puis compter chacune
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF' > /tmp/tables_list.txt
SET HEADING OFF;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
EOF

echo "Comptage des tables (peut prendre quelques minutes)..."
for t in $(grep -v "^$" /tmp/tables_list.txt | tr -d ' '); do
  COUNT=$(docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
    -user SYSDBA -password masterkey "$DB" 2>/dev/null <<EOF | grep -A1 "COUNT" | tail -1 | tr -d ' '
SET HEADING OFF;
SELECT COUNT(*) FROM $t;
EOF
)
  printf "%-28s %s\n" "$t" "$COUNT"
done
