#!/bin/bash
# Vérifier le contenu de fbintl.conf et la présence d'ICU dans le système du conteneur.
echo "=== fbintl.conf (collations enregistrées) ==="
docker exec magicmed-firebird sh -c 'cat /usr/local/firebird/intl/fbintl.conf | grep -i unicode | head -10'
echo ""
echo "=== ICU système présent ? ==="
docker exec magicmed-firebird sh -c 'ls /usr/lib/x86_64-linux-gnu/libicu* 2>/dev/null | head -5; ls /usr/local/firebird/lib/libicu* 2>/dev/null | head -5; echo "fin"'
