#!/usr/bin/env python3
"""Test direct : une requête isql brute, sortie NON filtrée, pour voir
exactement ce que renvoie l'extraction à 4 champs."""
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
blob_esc = ("REPLACE(REPLACE(CAST(CONSULTATION AS VARCHAR(32000)), "
            "ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), "
            "ASCII_CHAR(10), '<NL>')")

sel = ("SELECT "
       + fld("CONS_ID")
       + fld("NUM_PAT")
       + fld("DATE_CONSULT")
       + "COALESCE(" + blob_esc + ", '') || '" + SEP + "' || "
       + "'END' FROM PATIENTCONSULT WHERE CONS_ID IN (7, 13, 14)")

script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
          "SET HEADING OFF;\n"
          + sel + ";\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script.encode(), capture_output=True)
print("=== STDOUT BRUT (500 premiers caractères par section) ===")
out = p.stdout.decode("cp1252", errors="replace")
for k, line in enumerate(out.splitlines()[:12]):
    print(f"L{k} [{len(line)} car]: {line[:500]}")
print("=== STDERR ===")
print(p.stderr.decode(errors="replace")[:300])
