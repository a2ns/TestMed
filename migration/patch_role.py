#!/usr/bin/env python3
"""Renomme les occurrences de 'SYSDBA' en 'SYSDBB' (même longueur) dans une COPIE
de la base. Contourne le blocage volontaire de MagicMed (rôle SQL nommé SYSDBA
qui empêche la connexion de l'utilisateur SYSDBA sur Firebird 2.1+).

En ODS 11 (Firebird 2.0), les noms de métadonnées sont stockés en VARCHAR
(longueur préfixée), pas en CHAR(31) paddé — d'où la recherche sur les octets
bruts. Structure de pages intacte : même longueur d'octets.
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
CHUNK = 16 * 1024 * 1024
NEEDLE = b"SYSDBA"
REPL = b"SYSDBB"
OVER = len(NEEDLE) - 1

total = 0
carry = b""
with open(src, "rb") as f, open(dst, "wb") as g:
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = carry + chunk
        out, carry = data[:-OVER], data[-OVER:] if len(data) > OVER else b""
        total += out.count(NEEDLE)
        g.write(out.replace(NEEDLE, REPL))
    if carry:
        total += carry.count(NEEDLE)
        g.write(carry.replace(NEEDLE, REPL))

if total == 0:
    print("ATTENTION : aucune occurrence 'SYSDBA' trouvée — rien n'a été changé.")
else:
    print(f"{total} occurrence(s) 'SYSDBA' remplacée(s) par 'SYSDBB' (métadonnées + données éventuelles).")
