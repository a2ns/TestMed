#!/bin/bash
# Exporte quelques BLOB CONSULTATION binaires en fichiers pour inspection d'encodage.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1 || true)
DB="/database/$(basename "$ITB")"

# isql ne peut pas écrire de binaire proprement ; on passe par un script Python
# qui extrait les BLOB via ODBC... indisponible. Alternative : l'outil fb
# "isql -e" ? Le plus simple : extraire en hex via isql et convertir.
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;
SET WIDTH HEXA 32000;
SELECT 'H|' || p.CONS_ID || '|' || HEX(p.CONSULTATION)
FROM PATIENTCONSULT p WHERE p.CONS_ID = 7 ROWS 1;
EOF
