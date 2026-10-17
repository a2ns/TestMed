#!/bin/bash
# Sonde VACCINS_PATIENTS (577 lignes) + VACCINS (légende des vaccins).
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. Volume + légende vaccins (67 attendus)
SELECT 'X1|' || COUNT(*) FROM VACCINS_PATIENTS;
SELECT 'X2|' || v.ID || '|' || COALESCE(v.NOM, '?') FROM VACCINS v ROWS 10;

-- 2. Échantillon complet : vaccinations de patients
SELECT 'X3|' || vp.ID || '|' || vp.NUM_PAT || '|' || vp.VACCIN || '|' ||
  COALESCE(CAST(vp.DATEVACCIN AS VARCHAR(12)), '') || '|' ||
  COALESCE(CAST(vp.DATERAPPEL AS VARCHAR(12)), '') || '|' ||
  COALESCE(vp.LOT, '')
FROM VACCINS_PATIENTS vp ROWS 12;
EOF
