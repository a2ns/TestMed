#!/bin/bash
# Sortie BRUTE d'isql pour la légende : voir exactement ce que renvoie le NOM.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

echo "=== A. Requête OCTETS brute (10 premières lignes de sortie) ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" 2>&1 <<'EOF' | head -12
SET HEADING OFF;
SELECT ID || '|||' || COALESCE(CAST(SUBSTRING(NOM FROM 1 FOR 60) AS VARCHAR(60) CHARACTER SET OCTETS), '(null)') FROM VACCINS;
EOF

echo ""
echo "=== B. La longueur des BLOB NOM (sont-ils vides ?) ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" 2>&1 <<'EOF'
SET HEADING OFF;
SELECT 'L|' || ID || '|' || CASE WHEN NOM IS NULL THEN 'NULL' ELSE CAST(OCTET_LENGTH(NOM) AS VARCHAR(10)) END
FROM VACCINS;
EOF
