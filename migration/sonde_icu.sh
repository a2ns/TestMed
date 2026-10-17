#!/bin/bash
# Le conteneur a-t-il les bibliothèques ICU (collations UNICODE) ?
echo "=== Bibliothèques intl du conteneur Firebird ==="
docker exec magicmed-firebird sh -c 'ls -la /usr/local/firebird/intl/ 2>/dev/null | head -20'

echo ""
echo "=== Collations disponibles ==="
docker exec -i magicmed-firebird /usr/local/firebird/bin/isql \
  -user SYSDBA -password masterkey /database/MAGICMED-sysdbb.itb <<'EOF'
SET HEADING OFF;
SELECT 'C|' || RDB$COLLATION_NAME FROM RDB$COLLATIONS
WHERE RDB$CHARACTER_SET_NAME = 'UTF8';
EOF
