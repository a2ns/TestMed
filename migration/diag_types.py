#!/usr/bin/env python3
"""Diagnostic : que deviennent les ~6770 antécédents non traités ?
Affiche la répartition des TYPEATCD et le devenir de chaque catégorie."""
import os
import subprocess
import re
import sys

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, MIG_DIR)
from decode_richview import decode_richview

SEP = "|||"

itb = None
for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        itb = f
        break

fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
sel = ("SELECT " + fld("ID") + fld("NUM_PAT") + fld("TYPEATCD")
       + fld("LIBELLEATCD") + fld("CIM10") + fld("DATEATCD")
       + "COALESCE(REPLACE(REPLACE(REPLACE(CAST(COMMENTAIRE AS VARCHAR(32000)), "
       "ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), "
       "ASCII_CHAR(13), '<NL>'), ASCII_CHAR(10), '<NL>'), '') || '" + SEP + "' || "
       + "'END' FROM PATIENTATCD")

script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
          "SET HEADING OFF;\n" + sel + ";\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script.encode(), capture_output=True)
out = p.stdout.decode("cp1252", errors="replace")

from collections import Counter
dest = Counter()
specimens = {}
for line in out.splitlines():
    line = line.rstrip("\r")
    if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
        continue
    parts = line.split(SEP)
    if parts and parts[-1] == "END":
        parts = parts[:-1]
    if len(parts) < 5:
        dest["<5 champs"] += 1
        continue
    aid, numpat, typ, libelle, cim10 = [x.strip() if x else "" for x in parts[:5]]
    commentaire = parts[6].strip() if len(parts) > 6 else ""
    typ_n = re.sub(r"[^A-Za-z]", "", typ).upper() if typ else ""
    cle = typ_n or "(vide)"
    if not numpat:
        dest[f"{cle} sans patient"] += 1
    elif libelle:
        dest[f"{cle} avec libellé"] += 1
    elif commentaire:
        # décoder le commentaire pour voir s'il produit du texte
        texte = decode_richview(commentaire.replace("<NL>", "\r").encode("cp1252", errors="replace"))
        lignes_txt = [l for l in texte.split("\n") if l.strip() and not l.strip().startswith("rvs")]
        if lignes_txt:
            dest[f"{cle} commentaire décodable"] += 1
            if f"{cle} commentaire décodable" not in specimens:
                specimens[f"{cle} commentaire décodable"] = lignes_txt[0][:80]
        else:
            dest[f"{cle} commentaire vide"] += 1
            if f"{cle} commentaire vide" not in specimens:
                specimens[f"{cle} commentaire vide"] = commentaire[:100]
    else:
        dest[f"{cle} rien du tout"] += 1
        if f"{cle} rien du tout" not in specimens:
            specimens[f"{cle} rien du tout"] = f"type={typ!r}"

print("=== Devenir des lignes extraites ===")
for k, v in sorted(dest.items(), key=lambda x: -x[1]):
    print(f"  {v:6}  {k}")
print("\n=== Spécimens par catégorie ===")
for k, v in specimens.items():
    print(f"  {k}: {v!r}")
