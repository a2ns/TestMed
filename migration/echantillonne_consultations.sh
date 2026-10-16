#!/bin/bash
# Échantillonne consultations (CONSULTATION) et PATIENTSUIVI de MagicMed :
# contenu, types (texte/RTF/binaire), tailles, catégories de suivi.
set -uo pipefail
cd "$(dirname "$0")"

ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
[ -z "$ITB" ] && { echo "ERREUR : aucun .ITB"; exit 1; }
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- Échantillon : 8 consultations avec prescription, contenu décodé
SELECT 'C1|' || p.CONS_ID || '|' ||
  COALESCE(SUBSTRING(CAST(p.CONSULTATION AS VARCHAR(32000)) FROM 1 FOR 150), '<null>')
FROM PATIENTCONSULT p
WHERE EXISTS (SELECT 1 FROM PRESCRIPTIONS pr WHERE pr.CONS_ID = p.CONS_ID)
ROWS 8;

-- Le BLOB CONSULTATION : type (NULL / RTF / AUTRE)
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

-- PATIENTSUIVI : échantillon du contenu
SELECT 'S1|' || s.ID || '|' || s.NUM_PAT || '|' || s.DATE_SUIVI || '|' ||
  COALESCE(s.TEXTE, '<null>') || '|' || COALESCE(CAST(s.NOMBRE AS VARCHAR(20)), '') || '|' ||
  COALESCE(CAST(s.ENTIER AS VARCHAR(20)), '')
FROM PATIENTSUIVI s ROWS 20;

-- PATIENTSUIVI : catégories (colonne SUIVI)
SELECT 'S2|' || s.SUIVI || '|' || COUNT(*)
FROM PATIENTSUIVI s GROUP BY s.SUIVI ORDER BY COUNT(*) DESC ROWS 30;
EOF

-- CONFBIOMETRIE : la légende des codes de suivi ?
SELECT 'B0|' || f.RDB$FIELD_NAME FROM RDB$RELATION_FIELDS f
 WHERE f.RDB$RELATION_NAME = 'CONFBIOMETRIE' ORDER BY f.RDB$FIELD_ID;
