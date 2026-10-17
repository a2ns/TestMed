#!/bin/bash
# Retire la collation UNICODE_CI_AI de VACCINS.NOM (copie patchée) :
# Firebird la valide à chaque accès à la colonne, et elle n'est pas installée
# dans le conteneur. L'ALTER réécrit les métadonnées -> collation par défaut
# (binaire UTF8, sans ICU), les données sont conservées.
set -euo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

echo "Base : $DB"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
ALTER TABLE VACCINS ALTER COLUMN NOM TYPE BLOB SUB_TYPE TEXT CHARACTER SET UTF8;
COMMIT;
EOF
echo "Collation retirée. Test de lecture :"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'OK|' || v.ID || '|' || COALESCE(CAST(SUBSTRING(v.NOM FROM 1 FOR 60) AS VARCHAR(60)), '(vide)')
FROM VACCINS v;
EOF
