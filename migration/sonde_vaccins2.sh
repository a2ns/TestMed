#!/bin/bash
# Légende des vaccins : le NOM est un BLOB UTF8 — lire avec le bon charset.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

echo "=== Essai 1 : isql en UTF8, sous-chaîne du BLOB ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey -ch UTF8 "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'Y1|' || v.ID || '|' || COALESCE(SUBSTRING(CAST(v.NOM AS VARCHAR(200) CHARACTER SET UTF8) FROM 1 FOR 80), '')
FROM VACCINS v ROWS 10;
EOF

echo "=== Essai 2 : octets bruts (OCTETS) ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'Y2|' || v.ID || '|' || COALESCE(CAST(SUBSTRING(v.NOM FROM 1 FOR 20) AS VARCHAR(20) CHARACTER SET OCTETS), '')
FROM VACCINS v ROWS 5;
EOF
