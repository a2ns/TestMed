#!/usr/bin/env python3
"""Diagnostic : que renvoie l'extraction pour les types étoilés ?"""
import os
import subprocess

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
SEP = "|||"

itb = None
for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        itb = f
        break

fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
sel = ("SELECT " + fld("ID") + fld("NUM_PAT") + fld("TYPEATCD")
       + fld("LIBELLEATCD") + fld("CIM10") + fld("DATEATCD")
       + "'END' FROM PATIENTATCD")

script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
          "SET HEADING OFF;\n" + sel + ";\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script.encode(), capture_output=True)
out = p.stdout.decode("cp1252", errors="replace")

print("=== Comptage des lignes extraites ===")
compte = 0
ac = 0
specimens = []
for line in out.splitlines():
    line = line.rstrip("\r")
    if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
        continue
    compte += 1
    parts = line.split(SEP)
    if len(parts) >= 3:
        typ = parts[2]
        if "AC" in typ:
            ac += 1
            if len(specimens) < 4:
                specimens.append((typ, line))
print(f"lignes extraites : {compte}, avec AC dans le champ type : {ac}")

print("\n=== Spécimens (champ type + ligne brute tronquée) ===")
for typ, line in specimens:
    octets = typ.encode("cp1252", errors="replace")
    print(f"  type={typ!r} octets={octets.hex()} ligne={line[:150]!r}")

# cas de rejet : lignes avec moins de 5 champs après split
print("\n=== Lignes au parsing cassé (<6 champs) ===")
rejets = 0
for line in out.splitlines():
    line = line.rstrip("\r")
    if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
        continue
    parts = line.split(SEP)
    if parts and parts[-1] == "END":
        parts = parts[:-1]
    if len(parts) < 5:
        rejets += 1
        if rejets <= 3:
            print(f"  REJET [{len(parts)} champs]: {line[:150]!r}")
print(f"total rejets parsing : {rejets}")
