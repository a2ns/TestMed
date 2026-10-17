#!/usr/bin/env python3
"""Diagnostic : les antécédents étoilés sans libellé ont-ils un COMMENTAIRE ?"""
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
blob_esc = ("REPLACE(REPLACE(REPLACE(CAST(COMMENTAIRE AS VARCHAR(32000)), "
            "ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), "
            "ASCII_CHAR(13), '<NL>'), ASCII_CHAR(10), '<NL>')")

sel = ("SELECT " + fld("ID") + fld("NUM_PAT") + fld("TYPEATCD")
       + fld("LIBELLEATCD") + fld("CIM10") + "COALESCE(" + blob_esc + ", '') || '" + SEP + "' || "
       + "'END' FROM PATIENTATCD WHERE LIBELLEATCD IS NULL OR LIBELLEATCD = ''")

script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
          "SET HEADING OFF;\n" + sel + ";\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script.encode(), capture_output=True)
out = p.stdout.decode("cp1252", errors="replace")

total = 0
avec_commentaire = 0
specimens = []
for line in out.splitlines():
    line = line.rstrip("\r")
    if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
        continue
    parts = line.split(SEP)
    if parts and parts[-1] == "END":
        parts = parts[:-1]
    total += 1
    if len(parts) >= 6 and parts[5].strip():
        avec_commentaire += 1
        if len(specimens) < 5:
            specimens.append(parts)

print(f"Antécédents sans libellé : {total}")
print(f"  avec un COMMENTAIRE exploitable : {avec_commentaire}")
for s in specimens:
    print(f"  ex: id={s[0]} type={s[2]} commentaire={s[5][:100]!r}")
