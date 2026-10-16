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

echo "=== 1/4 Recherche du client Firebird ==="
# ATTENTION : la formule Homebrew 'firebird' est un émulateur de calculatrice TI,
# PAS le SGBD Firebird. Le vrai client s'installe autrement (voir README).
ISQL=$(command -v isql-fb || command -v isql || true)
if [ -z "$ISQL" ]; then
  if [ -x /opt/homebrew/opt/firebird-client/bin/isql-fb ]; then
    ISQL=/opt/homebrew/opt/firebird-client/bin/isql-fb
  elif [ -x /usr/local/opt/firebird-client/bin/isql-fb ]; then
    ISQL=/usr/local/opt/firebird-client/bin/isql-fb
  elif [ -x /Library/Frameworks/Firebird.framework/Resources/bin/isql ]; then
    ISQL=/Library/Frameworks/Firebird.framework/Resources/bin/isql
  fi
fi
if [ -z "$ISQL" ]; then
  echo "ERREUR : client Firebird introuvable."
  echo "Le SGBD Firebird n'est PAS dans Homebrew (la formule 'firebird' est un"
  echo "émulateur de calculatrice TI). Deux solutions (voir README.md) :"
  echo ""
  echo "  Option A (recommandée, 100% Homebrew) :"
  echo "    brew install colima docker"
  echo "    colima start"
  echo "    puis lancez : ./analyse.sh   (variante Docker du kit)"
  echo ""
  echo "  Option B : installez Firebird depuis https://firebirdsql.org -> Downloads"
  echo "    (installer macOS), puis relancez ce script."
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
