#!/bin/bash
# Contournement : Firebird 2.0 interdit l'ALTER de type sur BLOB. On crée une
# colonne VARCHAR (charset NONE = aucune collation) et on y copie les octets.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

echo "Base : $DB"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
ALTER TABLE VACCINS ADD NOM2 VARCHAR(120) CHARACTER SET NONE;
COMMIT;
UPDATE VACCINS SET NOM2 = CAST(SUBSTRING(NOM FROM 1 FOR 120) AS VARCHAR(120) CHARACTER SET NONE);
COMMIT;
EOF
echo ""
echo "Lecture via NOM2 :"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'OK|' || v.ID || '|' || COALESCE(v.NOM2, '(vide)')
FROM VACCINS v;
EOF
