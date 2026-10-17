#!/bin/bash
# Contournement final : créer VACCINS2 (sans collation) et copier les données.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
CREATE TABLE VACCINS2 (ID INTEGER, NOM VARCHAR(120) CHARACTER SET NONE);
COMMIT;
INSERT INTO VACCINS2 (ID, NOM)
SELECT ID, CAST(SUBSTRING(NOM FROM 1 FOR 120) AS VARCHAR(120) CHARACTER SET NONE)
FROM VACCINS;
COMMIT;
EOF
echo ""
echo "Lecture :"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'OK|' || ID || '|' || COALESCE(NOM, '(vide)') FROM VACCINS2;
EOF
