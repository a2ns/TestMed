#!/usr/bin/env python3
"""Micro-diagnostic : pourquoi la jointure patient ne matche-t-elle pas ?
Affiche : 5 patients des consultations marquées (patientId attendus) côté
PostgreSQL, et 5 NUM_PAT (convertis en UUID) extraits de Firebird.
"""
import os
import subprocess
import sys
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


src_uuid = lambda t, pk: str(uuid.uuid5(NS, f"magicmed:{t}:{pk}"))

print("=== 1. Patients des consultations marquées (PostgreSQL) ===")
rows = psql("SELECT DISTINCT \"patientId\" FROM \"Consultation\" "
            "WHERE notes IN ('-8 1 3 1', '-8 1 3 2') AND \"patientId\" IS NOT NULL "
            "LIMIT 5").split()
attendus = set(rows)
for r in rows:
    print("  attendu:", r)

print("\n=== 2. NUM_PAT -> UUID des consultations Firebird (échantillon) ===")
itb = None
for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        itb = f
        break
script = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
          "SET HEADING OFF;\n"
          "SELECT FIRST 5 'F|' || NUM_PAT FROM PATIENTCONSULT "
          "WHERE DATE_SUPPR IS NULL;\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script.encode(), capture_output=True)
out = p.stdout.decode("cp1252", errors="replace")
print(out)
extraits = set()
for ln in out.splitlines():
    ln = ln.strip()
    if ln.startswith("F|"):
        numpat = ln[2:].strip()
        if numpat:
            u = src_uuid("PATIENT", numpat)
            extraits.add(u)
            print("  extrait:", u, "(NUM_PAT=%s)" % numpat)

print("\n=== 3. Intersect des deux ensembles (échantillon) ===")
inter = attendus & extraits
print("  correspondances:", len(inter))

print("\n=== 4. Vérif : les NUM_PAT des patients marqués, côté Firebird ===")
# inverser : retrouver le NUM_PAT possible... impossible directement (uuid5
# à sens unique). A la place : exporter TOUS les NUM_PAT Firebird et vérifier
# combien d'UUIDs dérivés existent côté PostgreSQL.
script2 = (f"CONNECT '/database/{itb}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
           "SET HEADING OFF;\n"
           "SELECT 'P|' || NUM_PAT FROM PATIENT;\n")
p = subprocess.run(["docker", "exec", "-i", "magicmed-firebird",
                    "/usr/local/firebird/bin/isql", "-ch", "WIN1252"],
                   input=script2.encode(), capture_output=True)
out = p.stdout.decode("cp1252", errors="replace")
tous = set()
for ln in out.splitlines():
    ln = ln.strip()
    if ln.startswith("P|"):
        numpat = ln[2:].strip()
        if numpat:
            tous.add(src_uuid("PATIENT", numpat))
print(f"  patients Firebird -> {len(tous)} UUIDs")
presents = psql("SELECT id FROM \"Patient\"").split()
print(f"  patients PostgreSQL : {len(presents)}")
print(f"  intersection : {len(tous & set(presents))}")
