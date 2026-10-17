#!/usr/bin/env python3
"""Vérifie la sémantique de NUM_PAT dans PATIENTCONSULT vs PATIENT."""
import os
import subprocess
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]
src_uuid = lambda t, pk: str(uuid.uuid5(NS, f"magicmed:{t}:{pk}"))

def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    return r.stdout

itb = None
for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        itb = f
        break

def fb(sql):
    script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
              "SET HEADING OFF;\n" + sql + ";\n")
    p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                        "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                       input=script.encode(), capture_output=True)
    return p.stdout.decode("cp1252", errors="replace")

# 1. NUM_PAT de PATIENT : valeurs distinctes (min, max, count)
print("=== PATIENT.NUM_PAT : plage ===")
print(fb("SELECT 'P|' || MIN(NUM_PAT) || '|' || MAX(NUM_PAT) || '|' || COUNT(DISTINCT NUM_PAT) || '|' || COUNT(*) FROM PATIENT"))

# 2. NUM_PAT de PATIENTCONSULT : valeurs distinctes
print("=== PATIENTCONSULT.NUM_PAT : plage ===")
print(fb("SELECT 'C|' || MIN(NUM_PAT) || '|' || MAX(NUM_PAT) || '|' || COUNT(DISTINCT NUM_PAT) || '|' || COUNT(*) FROM PATIENTCONSULT WHERE DATE_SUPPR IS NULL"))

# 3. jointure réelle : NUM_PAT de PATIENTCONSULT = NUM_PAT de PATIENT ?
print("=== Jointure NUM_PAT = NUM_PAT : combien trouvent leur patient ? ===")
print(fb("SELECT 'J|' || COUNT(*) FROM PATIENTCONSULT pc "
         "JOIN PATIENT p ON p.NUM_PAT = pc.NUM_PAT"))

# 4. si pas : peut-être CONSULTDESSIN etc. — tester l'appartenance par ailleurs :
#    PATIENTCONSULT.NUM_PAT pourrait être un ID de "dossier" — voir la table
#    WRK_3333TEL ? Non. Tester: MAX(NUM_PAT) dans PATIENTCONSULT = 9561 ?
print("=== Échantillon : 10 NUM_PAT distincts de PATIENTCONSULT + leur patient éventuel ===")
out = fb("SELECT FIRST 10 'D|' || NUM_PAT FROM PATIENTCONSULT WHERE DATE_SUPPR IS NULL GROUP BY NUM_PAT")
numpats = [ln[2:].strip() for ln in out.splitlines() if ln.startswith("D|")]
for np in numpats:
    u = src_uuid("PATIENT", np)
    existe = psql(f"SELECT COUNT(*) FROM \"Patient\" WHERE id = '{u}'").strip()
    print(f"  NUM_PAT={np} -> UUID {u[:13]}... présent en PG : {existe}")
