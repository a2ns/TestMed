#!/bin/bash
# Échantillonne consultations (CONSULTATION) et PATIENTSUIVI de MagicMed.
set -uo pipefail
cd "$(dirname "$0")"

ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
[ -z "$ITB" ] && { echo "ERREUR : aucun .ITB"; exit 1; }
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- Colonnes de CONFBIOMETRIE (légende des codes de PATIENTSUIVI)
SELECT 'B0|' || f.RDB$FIELD_NAME FROM RDB$RELATION_FIELDS f
 WHERE f.RDB$RELATION_NAME = 'CONFBIOMETRIE' ORDER BY f.RDB$FIELD_ID;

-- Contenu de CONFBIOMETRIE (toutes les lignes, colonnes clé après inspection)
SELECT 'B1|' || b.ORDRE || '|' || COALESCE(b.LIBELLE, '?') || '|' ||
  COALESCE(CAST(b.MINI AS VARCHAR(10)), '') || '|' || COALESCE(CAST(b.MAXI AS VARCHAR(10)), '')
FROM CONFBIOMETRIE b ROWS 10;

-- Échantillon : consultations avec prescription, contenu décodé
SELECT 'C1|' || p.CONS_ID || '|' ||
  COALESCE(SUBSTRING(CAST(p.CONSULTATION AS VARCHAR(32000)) FROM 1 FOR 150), '<null>')
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
ROWS 8;

-- Type du BLOB CONSULTATION (NULL / RTF / AUTRE)
SELECT 'C2|' || p.CONS_ID || '|' ||
  CASE
    WHEN p.CONSULTATION IS NULL THEN 'NULL'
    WHEN CAST(p.CONSULTATION AS VARCHAR(6)) LIKE '{\rtf%' THEN 'RTF'
    ELSE 'AUTRE'
  END
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
ROWS 20;

-- Tailles des BLOB CONSULTATION
SELECT 'C3|' || p.CONS_ID || '|' || OCTET_LENGTH(p.CONSULTATION)
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
ROWS 20;
EOF
