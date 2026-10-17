#!/bin/bash
# Sonde PATIENTVALTSH : les résultats de laboratoire (codes, libellés, valeurs).
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. Volume total
SELECT 'V1|' || COUNT(*) FROM PATIENTVALTSH;

-- 2. Les types d'analyses (TYPEVALTSH) et volumes
SELECT 'V2|' || TYPEVALTSH || '|' || COUNT(*)
FROM PATIENTVALTSH GROUP BY TYPEVALTSH;

-- 3. Échantillon complet : 15 résultats avec dates et valeurs
SELECT 'V3|' || NUMDOSSIERTSH || '|' || NUM_PAT || '|' || DATETSH || '|' || TYPEVALTSH || '|' ||
  CODEVALEUR || '|' || LEFT(CAST(VALEUR AS VARCHAR(50)), 50) || '|' || LEFT(CAST(HEURETSH AS VARCHAR(10)), 10)
FROM PATIENTVALTSH ROWS 15;

-- 4. La légende : PATIENTVALTSHCONF (libellés des analyses)
SELECT 'V4|' || ID || '|' || TYPEVALTSH || '|' || COALESCE(LIBELLEBALISE, '?')
FROM PATIENTVALTSHCONF;
EOF
