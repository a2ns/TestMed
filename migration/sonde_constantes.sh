#!/bin/bash
# Sonde PATIENTSUIVI : légende des codes (CONFBIOMETRIE) + échantillon croisé.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. Légende : CONFBIOMETRIE (ORDRE + LIBELLE + bornes)
SELECT 'B1|' || b.ORDRE || '|' || COALESCE(b.LIBELLE, '?') || '|' ||
  COALESCE(CAST(b.MINI AS VARCHAR(10)), '') || '|' || COALESCE(CAST(b.MAXI AS VARCHAR(10)), '')
FROM CONFBIOMETRIE b;

-- 2. Croisement : PATIENTSUIVI.SUIVI = CONFBIOMETRIE.ORDRE ?
SELECT 'B2|' || s.SUIVI || '|' || COUNT(*)
FROM PATIENTSUIVI s GROUP BY s.SUIVI;

-- 3. Échantillon enrichi : 15 mesures avec valeurs
SELECT 'B3|' || s.ID || '|' || s.NUM_PAT || '|' || s.DATE_SUIVI || '|' ||
  s.SUIVI || '|' || COALESCE(s.TEXTE, '') || '|' ||
  COALESCE(CAST(s.NOMBRE AS VARCHAR(20)), '') || '|' ||
  COALESCE(CAST(s.ENTIER AS VARCHAR(20)), '')
FROM PATIENTSUIVI s ROWS 15;
EOF
