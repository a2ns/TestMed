#!/usr/bin/env python3
"""Localise les occurrences de 'SYSDBA' dans le fichier .ITB et affiche leur contexte
binaire, pour comprendre comment le nom du rôle est réellement stocké."""
import sys

path = sys.argv[1]
CHUNK = 16 * 1024 * 1024
KEEP = 64
found = []
carry = b""
offset = 0

with open(path, "rb") as f:
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = carry + chunk
        body, carry = data[:-KEEP], data[-KEEP:]
        start = 0
        while True:
            i = body.find(b"SYSDBA", start)
            if i == -1:
                break
            found.append(offset - len(carry) + i)
            start = i + 1
        offset += len(body)

for off in found[:20]:
    with open(path, "rb") as f:
        f.seek(max(0, off - 16))
        ctx = f.read(80)
    print(f"offset {off:>12} : {ctx!r}")
print(f"Total occurrences : {len(found)}")
