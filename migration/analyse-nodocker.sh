#!/bin/bash
# Analyse de la base MagicMed/MagicGed (.ITB) — SANS DOCKER (macOS + Homebrew).
# Usage : ./analyse-nodocker.sh  (les fichiers .ITB doivent être dans ./data/)
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 0/4 Homebrew présent ? ==="
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew n'est pas installé. Installez-le avec :"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo "Puis relancez ce script."
  exit 1
fi

echo "=== 1/4 Installation de Firebird (si nécessaire) ==="
brew install firebird 2>/dev/null || brew upgrade firebird 2>/dev/null || true
ISQL=$(command -v isql-fb || command -v isql || true)
if [ -z "$ISQL" ]; then
  echo "ERREUR : isql-fb introuvable après installation. Essayez :"
  echo "  ls /opt/homebrew/opt/firebird/bin/  (Mac Apple Silicon)"
  echo "  ls /usr/local/opt/firebird/bin/     (Mac Intel)"
  exit 1
fi
echo "isql trouvé : $ISQL"

echo "=== 2/4 Vérification de l'en-tête du fichier ==="
FIRST_ITB=$(ls data/*.ITB data/*.itb 2>/dev/null | head -1 || true)
if [ -z "$FIRST_ITB" ]; then
  echo "ERREUR : aucun fichier .ITB trouvé dans ./data/"
  exit 1
fi
echo "Fichier analysé : $FIRST_ITB ($(du -h "$FIRST_ITB" | cut -f1))"
echo "--- Signature binaire (texte lisible dans les 512 premiers octets) ---"
head -c 512 "$FIRST_ITB" | strings | head -20
echo "--- En-tête (128 premiers octets en hexadécimal) ---"
xxd -l 128 "$FIRST_ITB" 2>/dev/null || od -A x -t x1z -v "$FIRST_ITB" | head -8

echo ""
echo "=== 3/4 Lecture de la base (liste des tables) ==="
"$ISQL" -user SYSDBA -password masterkey "$PWD/$FIRST_ITB" <<'SQL'
SET LIST ON;
SELECT RDB$RELATION_NAME FROM RDB$RELATIONS
 WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
 ORDER BY RDB$RELATION_NAME;
SQL

echo "=== 4/4 Détail des colonnes par table ==="
"$ISQL" -user SYSDBA -password masterkey "$PWD/$FIRST_ITB" <<'SQL'
SELECT r.RDB$RELATION_NAME AS TABLE_NAME,
       f.RDB$FIELD_NAME AS COLUMN_NAME,
       f.RDB$FIELD_ID AS POSITION
FROM RDB$RELATION_FIELDS f
JOIN RDB$RELATIONS r ON r.RDB$RELATION_NAME = f.RDB$RELATION_NAME
WHERE r.RDB$SYSTEM_FLAG = 0 AND r.RDB$VIEW_BLR IS NULL
ORDER BY 1, 3;
SQL

echo ""
echo "=== Terminé. Copiez TOUTE la sortie ci-dessus et envoyez-la. ==="
