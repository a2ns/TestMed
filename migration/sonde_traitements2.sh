#!/bin/bash
# Sonde complémentaire : nom du médicament (MEDICAMENTS.NOMCOMMERCIAL) et légende MOMENTPRISE.
set -uo pipefail
cd "$(dirname "$0")"
ITB=$(ls data/*-sysdbb.itb data/*.ITB 2>/dev/null | head -1)
DB="/database/$(basename "$ITB")"

docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey "$DB" <<'EOF'
SET HEADING OFF;

-- 1. VIDALPRODUCT : ses vraies colonnes (via les tables système)
SELECT 'W0|' || f.RDB$FIELD_NAME FROM RDB$RELATION_FIELDS f
 WHERE f.RDB$RELATION_NAME = 'VIDALPRODUCT' ORDER BY f.RDB$FIELD_ID;

-- 2. VIDALPRODUCT échantillon : id + ce qu'on peut lire
SELECT 'W1|' || v.ID || '|' || COALESCE(v.FORME, '')
FROM VIDALPRODUCT v ROWS 8;

-- 3. MEDICAMENTS : id + nom commercial (la vraie source des noms)
SELECT 'W2|' || m.ID || '|' || COALESCE(m.NOMCOMMERCIAL, '?') || '|' || COALESCE(m.FORME, '')
FROM MEDICAMENTS m ROWS 8;

-- 4. Lien : VIDALPRODUCT(452) -> nom ?
SELECT 'W3|' || m.ID || '|' || COALESCE(m.NOMCOMMERCIAL, '?')
FROM MEDICAMENTS m WHERE m.ID IN (452, 313, 1, 2, 3, 4, 5);

-- 5. La légende des moments de prise : CONFQUAND
SELECT 'W4|' || QUAND FROM CONFQUAND;
EOF
