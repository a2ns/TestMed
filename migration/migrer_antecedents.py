#!/usr/bin/env python3
"""Migre PATIENTATCD (1 309 antécédents MagicMed) -> Antecedent + Allergie (Primia).

Mapping des types (déduit des données, cf docs/bdd-magicmed.md) :
  AM / *AM : Antécédent Médical     -> Antecedent.categorie = 'MEDICAL'
  AC / *AC : Antécédent Chirurgical -> 'CHIRURGICAL'
  AF / *AF : Antécédent Familial    -> 'FAMILIAL'
  ALL/*ALL: Allergie                -> table Allergie (substance = libellé)
  DCD      : patient décédé         -> ignoré (info d'état civil)

Usage : python3 migrer_antecedents.py [--dry-run]
"""

import csv
import os
import re
import subprocess
import sys
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
DRY_RUN = "--dry-run" in sys.argv
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
        raise RuntimeError("Erreur isql : " + out[:300])
    rows = []
    for line in out.splitlines():
        line = line.rstrip("\r")
        if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
            continue
        parts = line.split(SEP)
        if parts and parts[-1] == "END":
            parts = parts[:-1]
        rows.append(parts)
    return rows


def clean(v):
    return v.strip() if v and v.strip() else None


CATEGORIES = {
    "AM": "MEDICAL",
    "AC": "CHIRURGICAL",
    "AF": "FAMILIAL",
}


def main():
    itb = None
    data_dir = os.path.join(MIG_DIR, "data")
    for f in sorted(os.listdir(data_dir)):
        if f.lower().endswith("-sysdbb.itb"):
            itb = f
            break
    if not itb:
        print("ERREUR : aucune base -sysdbb.itb dans ./data/")
        sys.exit(1)
    db = f"/database/{itb}"

    pg_patients = set(psql('SELECT id FROM "Patient"').split())
    print(f"Patients Primia : {len(pg_patients)}")

    print("Extraction PATIENTATCD...")
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    rows = fb_query(
        db,
        "SELECT " + fld("ID") + fld("NUM_PAT") + fld("TYPEATCD")
        + fld("LIBELLEATCD") + fld("CIM10") + fld("DATEATCD")
        + "'END' FROM PATIENTATCD")
    print(f"Antécédents extraits : {len(rows)}")

    antecedents = []   # (id, patientId, categorie, libelle, annee, notes)
    allergies = []     # (id, patientId, substance, reactions)
    stats = {"medical": 0, "chirurgical": 0, "familial": 0, "allergie": 0,
             "ignores": 0}
    for r in rows:
        if len(r) < 5:
            continue
        aid, numpat, typ, libelle, cim10 = [clean(x) for x in r[:5]]
        if typ:
            # ne garder que les lettres : '*AM', '\x93AM', 'AM ' -> 'AM'
            typ = re.sub(r"[^A-Za-z]", "", typ).upper()
        date_raw = clean(r[5]) if len(r) > 5 else None
        if not numpat or not libelle:
            continue
        pid = src_uuid("PATIENT", numpat)
        if pid not in pg_patients:
            stats["ignores"] += 1
            continue
        # annee : DATEATCD au format libre ("2004", "2004-06"...) -> extraire l'année
        annee = None
        if date_raw:
            m = re.search(r"(19|20)\d{2}", date_raw)
            if m:
                annee = int(m.group(0))
        # notes : CIM10 + libellé long (retirer le [code] déjà dans le libellé)
        notes = []
        if cim10 and cim10 not in libelle:
            notes.append(f"CIM10 : {cim10}")
        if notes:
            notes_txt = " ; ".join(notes)
        else:
            notes_txt = None

        if typ == "ALL":
            # allergie : substance = libellé nettoyé
            substance = libelle
            allergies.append((src_uuid("PATIENTATCD", aid), pid, substance,
                              "FAIBLE", notes_txt))
            stats["allergie"] += 1
        elif typ in CATEGORIES:
            antecedents.append((src_uuid("PATIENTATCD", aid), pid,
                                CATEGORIES[typ], libelle, annee, notes_txt))
            stats[CATEGORIES[typ].lower()] += 1
        else:
            stats["ignores"] += 1

    print(f"Antécédents : {len(antecedents)}  Allergies : {len(allergies)}")
    print(f"  Répartition : {stats}")
    if DRY_RUN:
        for a in antecedents[:3]:
            print("  ex antécédent:", a)
        for a in allergies[:2]:
            print("  ex allergie:", a)
        return

    # Ré-injection Antecedent
    if antecedents:
        with open("/tmp/antecedents.csv", "w", encoding="utf-8") as fh:
            csv.writer(fh).writerows(antecedents)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_atcd; "
                               "CREATE TABLE maj_atcd (id TEXT, pid TEXT, "
                               "cat TEXT, lib TEXT, an INT, nte TEXT);"],
                       check=True, capture_output=True)
        with open("/tmp/antecedents.csv", encoding="utf-8") as fh:
            r = subprocess.run(PSQL + ["-c", "\\copy maj_atcd FROM STDIN WITH CSV"],
                               stdin=fh, capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR import antécédents :", r.stderr[:300])
            sys.exit(1)
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
            'INSERT INTO "Antecedent" (id, "patientId", categorie, libelle, annee, notes) '
            "SELECT m.id, m.pid, m.cat, m.lib, m.an, m.nte FROM maj_atcd m "
            'WHERE NOT EXISTS (SELECT 1 FROM "Antecedent" a WHERE a.id = m.id);'],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR insertion antécédents :", r.stderr[:300])
            sys.exit(1)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_atcd;"],
                       capture_output=True)

    # Ré-injection Allergie
    if allergies:
        with open("/tmp/allergies.csv", "w", encoding="utf-8") as fh:
            csv.writer(fh).writerows(allergies)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_all; "
                               "CREATE TABLE maj_all (id TEXT, pid TEXT, "
                               "sub TEXT, gra TEXT, rea TEXT);"],
                       check=True, capture_output=True)
        with open("/tmp/allergies.csv", encoding="utf-8") as fh:
            r = subprocess.run(PSQL + ["-c", "\\copy maj_all FROM STDIN WITH CSV"],
                               stdin=fh, capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR import allergies :", r.stderr[:300])
            sys.exit(1)
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
            'INSERT INTO "Allergie" (id, "patientId", substance, gravite, reactions) '
            "SELECT m.id, m.pid, m.sub, m.gra, m.rea FROM maj_all m "
            'WHERE NOT EXISTS (SELECT 1 FROM "Allergie" a WHERE a.id = m.id);'],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR insertion allergies :", r.stderr[:300])
            sys.exit(1)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_all;"],
                       capture_output=True)

    nb_a = psql('SELECT COUNT(*) FROM "Antecedent"').strip()
    nb_al = psql('SELECT COUNT(*) FROM "Allergie"').strip()
    print(f"\nAntecedent total : {nb_a}")
    print(f"Allergie total   : {nb_al}")


if __name__ == "__main__":
    main()
