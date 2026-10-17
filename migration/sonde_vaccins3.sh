#!/bin/bash
# Légende vaccins : contourner la collation manquante (pas de tri, cast octets).
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

echo "=== Essai 3 : sans ORDER BY ni ROWS (source du tri de la collation ?), BLOB casté en OCTETS ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" 2>&1 <<'EOF'
SET HEADING OFF;
SELECT 'Y3|' || v.ID FROM VACCINS v;
EOF

echo ""
echo "=== Essai 4 : la structure exacte de VACCINS.NOM (charset déclaré) ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" 2>&1 <<'EOF'
SET HEADING OFF;
SELECT 'Y4|' || f.RDB$FIELD_NAME || '|' ||
  COALESCE(CAST(c.RDB$CHARACTER_SET_NAME AS VARCHAR(30)), 'none') || '|' ||
  COALESCE(CAST(c2.RDB$CHARACTER_SET_NAME AS VARCHAR(30)), 'none')
FROM RDB$RELATION_FIELDS f
JOIN RDB$FIELDS fl ON fl.RDB$FIELD_NAME = f.RDB$FIELD_SOURCE
LEFT JOIN RDB$CHARACTER_SETS c ON c.RDB$CHARACTER_SET_ID = fl.RDB$CHARACTER_SET_ID
LEFT JOIN RDB$COLLATIONS co ON co.RDB$COLLATION_ID = fl.RDB$COLLATION_ID
LEFT JOIN RDB$CHARACTER_SETS c2 ON c2.RDB$CHARACTER_SET_ID = co.RDB$CHARACTER_SET_ID
WHERE f.RDB$RELATION_NAME = 'VACCINS';
EOF
