#!/usr/bin/env python3
"""Renomme le rôle SQL 'SYSDBA' (en conflit avec l'utilisateur Firebird) en 'SYSDBX'
dans une COPIE de la base. Même longueur d'octets : structure de pages intacte.
Les noms de rôle sont stockés dans des CHAR(31) : 'SYSDBA' suivi de 25 espaces.
"""
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
CHUNK = 16 * 1024 * 1024
PAT = re.compile(rb'(sysdba)( {25})', re.IGNORECASE)
KEEP = 32


def repl(m):
    name = m.group(1)
    return name[:-1] + b'X' + m.group(2)


total = 0
carry = b''
with open(src, 'rb') as f, open(dst, 'wb') as g:
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = carry + chunk
        out, carry = data[:-KEEP], data[-KEEP:]
        total += len(PAT.findall(out))
        g.write(PAT.sub(repl, out))
    if carry:
        total += len(PAT.findall(carry))
        g.write(PAT.sub(repl, carry))

if total == 0:
    print("ATTENTION : aucun rôle 'SYSDBA' (paddé CHAR(31)) trouvé — le patch n'a rien changé.")
else:
    print(f"{total} occurrence(s) du rôle 'SYSDBA' remplacée(s) par 'SYSDBX'.")
