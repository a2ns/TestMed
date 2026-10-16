#!/bin/bash
# Identifie l'encodage des BLOB CONSULTATION binaires (compression ? format ?)
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- Classification : classe calculee dans une sous-table derivee, puis GROUP BY simple
SELECT 'H1|' || t.CLASSE || '|' || COUNT(*)
FROM (
  SELECT
    CASE
      WHEN p.CONSULTATION IS NULL THEN 'NULL'
      WHEN CAST(SUBSTRING(p.CONSULTATION FROM 1 FOR 6) AS VARCHAR(6)) LIKE '{\rtf%' THEN 'RTF'
      ELSE 'INCONNU'
    END AS CLASSE
  FROM PATIENTCONSULT p
  WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
) t
GROUP BY t.CLASSE;

-- Specimens INCONNU : 16 premiers octets bruts (charset OCTETS)
SELECT FIRST 5 'H2|' || p.CONS_ID || '|' ||
  CAST(SUBSTRING(p.CONSULTATION FROM 1 FOR 16) AS VARCHAR(16) CHARACTER SET OCTETS)
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
  AND p.CONSULTATION IS NOT NULL
  AND CAST(SUBSTRING(p.CONSULTATION FROM 1 FOR 6) AS VARCHAR(6)) NOT LIKE '{\rtf%';
EOF
