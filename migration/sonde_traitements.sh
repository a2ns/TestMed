#!/bin/bash
# Sonde PRESCRIPTIONSDET : les lignes de traitements (70 314) à migrer vers Traitement.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. Volume + distincts
SELECT 'P1|' || COUNT(*) FROM PRESCRIPTIONSDET;

-- 2. Colonnes clés : échantillon de 15 lignes complètes
SELECT 'P2|' || NUMPRESCRIPTION || '|' || NUMLIGNE || '|' || TYPELIGNE || '|' ||
  COALESCE(CAST(VIDALPRODUCT AS VARCHAR(30)), '') || '|' ||
  COALESCE(CAST(VIDALDCI AS VARCHAR(30)), '') || '|' ||
  COALESCE(CAST(DUREE AS VARCHAR(40)), '') || '|' ||
  COALESCE(CAST(MOMENTPRISE AS VARCHAR(40)), '')
FROM PRESCRIPTIONSDET ROWS 15;

-- 3. La jointure vers le médicament : VIDALPRODUCT contient quoi ?
SELECT 'P3|' || v.ID || '|' || LEFT(CAST(v.NOMSPECIALITE AS VARCHAR(60)), 60)
FROM VIDALPRODUCT v ROWS 8;

-- 4. La prescription parent : dates + suppression
SELECT 'P4|' || pr.NUMPRESCRIPTION || '|' || pr.NUMPATIENT || '|' || pr.DATECONSULT || '|' ||
  COALESCE(CAST(pr.DATE_SUPPR AS VARCHAR(12)), '')
FROM PRESCRIPTIONS pr ROWS 8;
EOF
