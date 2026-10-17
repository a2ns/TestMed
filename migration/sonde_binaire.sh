#!/bin/bash
# Sonde la STRUCTURE des BLOB CONSULTATION : contenu au-delà du marqueur initial.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SET WIDTH LIGNE 32000;

-- Specimen 1 (CONS_ID=7) : les 300 premiers octets APRES le debut
SELECT FIRST 1 'X1|' || p.CONS_ID || '|' ||
  CAST(SUBSTRING(p.CONSULTATION FROM 1 FOR 300) AS VARCHAR(300) CHARACTER SET OCTETS)
FROM PATIENTCONSULT p WHERE p.CONS_ID = 7;

-- Specimen 2 : un "INCONNU" plus gros (2 Ko) au hasard
SELECT FIRST 1 'X2|' || p.CONS_ID || '|' ||
  CAST(SUBSTRING(p.CONSULTATION FROM 1 FOR 300) AS VARCHAR(300) CHARACTER SET OCTETS)
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
  AND OCTET_LENGTH(p.CONSULTATION) > 2000
  AND p.CONS_ID <> 7;

-- Specimen 3 : le MILIEU d'un gros BLOB (octets 1000-1300) pour voir la suite
SELECT FIRST 1 'X3|' || p.CONS_ID || '|' ||
  CAST(SUBSTRING(p.CONSULTATION FROM 1000 FOR 300) AS VARCHAR(300) CHARACTER SET OCTETS)
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
  AND OCTET_LENGTH(p.CONSULTATION) > 2000;
EOF
