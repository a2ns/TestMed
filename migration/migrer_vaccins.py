#!/usr/bin/env python3
"""Migre VACCINS_PATIENTS (577 vaccinations MagicMed) -> Vaccination (Primia).

Joint la légende VACCINS (nom du vaccin en clair) et crée la table si absente.
"""

import csv
import os
import subprocess
import sys
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
SEP = "|||"
PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]
FB_ISQL = "/usr/local/firebird/bin/isql"

src_uuid = lambda t, pk: str(uuid.uuid5(NS, f"magicmed:{t}:{pk}"))


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


def fb_query(db, select_sql):
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    script = (f"CONNECT '{db}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
              "SET HEADING OFF;\n" + select_sql + ";\n")
    p = subprocess.run(
        ["docker", "exec", "-i", "magicmed-firebird", FB_ISQL, "-ch", "WIN1252"],
        input=script.encode(), capture_output=True)
    out = p.stdout.decode("cp1252", errors="replace")
    if "Statement failed" in out:
        raise RuntimeError("Erreur isql : " + out[:400])
    rows = []
    for line in out.splitlines():
        line = line.rstrip("\r")
        if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
            continue
        parts = line.split(SEP, 6)
        if len(parts) == 7 and parts[6] == "END":
            parts = parts[:6]
        rows.append(parts)
    return rows


def clean(v):
    return v.strip() if v and v.strip() else None


def main():
    itb = None
    for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
        if f.lower().endswith("-sysdbb.itb"):
            itb = f
            break
    if not itb:
        print("ERREUR : aucune base -sysdbb.itb")
        sys.exit(1)
    db = f"/database/{itb}"

    # 0. créer la table Vaccination si absente
    r = subprocess.run(PSQL + ["-c",
        'CREATE TABLE IF NOT EXISTS "Vaccination" ('
        'id TEXT PRIMARY KEY, '
        '"patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE CASCADE, '
        'vaccin TEXT NOT NULL, '
        'date DATE, '
        '"dateRappel" DATE, '
        'lot TEXT);'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR création table :", r.stderr[:300])
        sys.exit(1)
    print("Table Vaccination prête")

    pg_patients = set(psql('SELECT id FROM "Patient"').split())
    print(f"Patients Primia : {len(pg_patients)}")

    # 1. légende des vaccins : le champ NOM est en charset UTF8 avec une
    # collation absente du conteneur. Parade : cast en OCTETS DANS la requête
    # (aucune comparaison/tri sur du texte), lecture globale en bloc.
    print("Légende des vaccins (VACCINS, via OCTETS)...")
    script_legende = (
        f"CONNECT '{db}' USER 'SYSDBA' PASSWORD 'masterkey' CHARSET NONE;\n"
        "SET HEADING OFF;\n"
        "SELECT ID || '|||' || "
        "COALESCE(CAST(SUBSTRING(NOM FROM 1 FOR 120) "
        "AS VARCHAR(120) CHARACTER SET OCTETS), '') || '|||' || "
        "'END' FROM VACCINS;\n"
    )
    pr = subprocess.run(
        ["docker", "exec", "-i", "magicmed-firebird", FB_ISQL],
        input=script_legende.encode("utf-8"), capture_output=True)
    out = pr.stdout.decode("latin1", errors="replace")
    noms = {}
    if "Statement failed" in out:
        print("  AVERTISSEMENT légende :", out[:200].replace("\n", " | "))
    for ligne in out.splitlines():
        ligne = ligne.rstrip("\r").strip()
        if not ligne or ligne.startswith(("Use CONNECT", "Database:")) or "Statement failed" in ligne:
            continue
        if "|||" not in ligne:
            continue
        parties = ligne.split("|||")
        if len(parties) >= 2:
            vid = parties[0].strip()
            brut = parties[1]
            if not vid or not brut.strip():
                continue
            try:
                nom = brut.encode("latin1", errors="ignore").decode("utf-8", errors="replace").strip()
            except Exception:
                nom = brut.strip()
            if nom:
                noms[vid] = nom
    print(f"  {len(noms)} vaccins nommés")

    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    # 2. vaccinations des patients
    print("Vaccinations (VACCINS_PATIENTS)...")
    rows = fb_query(
        db,
        "SELECT " + fld("ID") + fld("NUM_PAT") + fld("VACCIN")
        + fld("DATEVACCIN") + fld("DATERAPPEL") + fld("LOT")
        + "'END' FROM VACCINS_PATIENTS")
    print(f"  {len(rows)} vaccinations extraites")

    updates = []
    inconnus = set()
    for r in rows:
        if len(r) < 3:
            continue
        vid, numpat, vaccin_id = [clean(x) for x in r[:3]]
        date_vaccin = clean(r[3]) if len(r) > 3 else None
        date_rappel = clean(r[4]) if len(r) > 4 else None
        lot = clean(r[5]) if len(r) > 5 else None
        if not numpat:
            continue
        pid = src_uuid("PATIENT", numpat)
        if pid not in pg_patients:
            continue
        nom = noms.get(vaccin_id)
        if not nom:
            inconnus.add(vaccin_id)
            nom = f"Vaccin #{vaccin_id}"
        updates.append((src_uuid("VACCINS_PATIENTS", vid), pid, nom,
                        date_vaccin, date_rappel, lot))

    print(f"Vaccinations à insérer : {len(updates)} (vaccins inconnus : {len(inconnus)})")
    if not updates:
        return

    with open("/tmp/vaccins.csv", "w", encoding="utf-8") as fh:
        csv.writer(fh).writerows(updates)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_vacc; "
                           "CREATE TABLE maj_vacc (id TEXT, pid TEXT, vac TEXT, "
                           "dv DATE, dr DATE, lot TEXT);"],
                   check=True, capture_output=True)
    with open("/tmp/vaccins.csv", encoding="utf-8") as fh:
        r = subprocess.run(PSQL + ["-c", "\\copy maj_vacc FROM STDIN WITH CSV"],
                           stdin=fh, capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR import :", r.stderr[:300])
        sys.exit(1)
    r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
        'INSERT INTO "Vaccination" (id, "patientId", vaccin, date, "dateRappel", lot) '
        "SELECT m.id, m.pid, m.vac, m.dv, m.dr, m.lot FROM maj_vacc m "
        'WHERE NOT EXISTS (SELECT 1 FROM "Vaccination" v WHERE v.id = m.id);'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR insertion :", r.stderr[:300])
        sys.exit(1)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_vacc;"], capture_output=True)

    total = psql('SELECT COUNT(*) FROM "Vaccination"').strip()
    par_vaccin = psql('SELECT vaccin || \':\' || COUNT(*) FROM "Vaccination" '
                      "GROUP BY vaccin ORDER BY COUNT(*) DESC LIMIT 10").strip()
    print(f"\nVaccination total : {total}")
    print(par_vaccin)


if __name__ == "__main__":
    main()
