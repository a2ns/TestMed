#!/bin/bash
# Diagnostic : pourquoi aucun CONS_ID ne correspond aux consultations marquées ?
# 1. UUIDs marqués côté Primia (5 échantillons)
# 2. Pour chacun : l'UUID dériverait de quel CONS_ID ? (inversion uuid5 impossible :
#    on teste plutôt la correspondance date/patient)
set -uo pipefail
cd "$(dirname "$0")"

echo "=== 1. Échantillon de consultations marquées (id, date, patient) ==="
docker exec magicmed-postgres psql -U primia -d primia -c \
  "SELECT id, date, \"patientId\" FROM \"Consultation\"
   WHERE notes IN ('-8 1 3 1','-8 1 3 2') ORDER BY date DESC LIMIT 5"

echo ""
echo "=== 2. Comptage global : marquées par plage de dates ==="
docker exec magicmed-postgres psql -U primia -d primia -c \
  "SELECT date_part('year', date) AS annee, COUNT(*)
   FROM \"Consultation\" WHERE notes IN ('-8 1 3 1','-8 1 3 2')
   GROUP BY 1 ORDER BY 1"

echo ""
echo "=== 3. Côté Firebird : CONS_ID des consultations des mêmes années ==="
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SELECT 'FB|' || EXTRACT(YEAR FROM DATE_CONSULT) || '|' || COUNT(*) || '|' ||
  MIN(CONS_ID) || '|' || MAX(CONS_ID)
FROM PATIENTCONSULT WHERE DATE_SUPPR IS NULL
GROUP BY 1 ORDER BY 1;
EOF
