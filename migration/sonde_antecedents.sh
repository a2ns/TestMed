#!/bin/bash
# Sonde PATIENTATCD : catégories, échantillon, correspondance avec Antecedent Primia.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. Types d'antécédents (TYPEATCD) et volumes
SELECT 'T1|' || TYPEATCD || '|' || COUNT(*)
FROM PATIENTATCD GROUP BY TYPEATCD;

-- 2. Échantillon : 15 antécédents complets
SELECT 'T2|' || NUM_PAT || '|' || COALESCE(TYPEATCD, '') || '|' ||
  COALESCE(LIBELLEATCD, '') || '|' || COALESCE(CIM10, '') || '|' ||
  COALESCE(DATEATCD, '') || '|' || LEFT(COALESCE(CAST(COMMENTAIRE AS VARCHAR(1000)), ''), 80)
FROM PATIENTATCD ROWS 15;

-- 3. Correspondants : types distincts avec exemples de libellés
SELECT 'T3|' || TYPEATCD || '|' ||
  LEFT(COALESCE(CAST(LIST(LIBELLEATCD) WITHIN GROUP (ORDER BY LIBELLEATCD), 300), CAST('' AS VARCHAR(300))), 300)
FROM PATIENTATCD GROUP BY TYPEATCD;
EOF
