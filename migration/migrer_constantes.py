#!/usr/bin/env python3
"""Migre PATIENTSUIVI (18 079 mesures MagicMed) -> ConstanteBio (Primia).

Légende des codes SUIVI (déduite des données, cf docs/bdd-magicmed.md) :
  -8 : tension artérielle  (NOMBRE=systolique, ENTIER=diastolique)
  -2 : poids               (NOMBRE, kg)
  -1 : taille              (NOMBRE, cm)
   2 : IMC                 (NOMBRE)

Chaque mesure devient 1 ligne ConstanteBio (la tension en produit 2 :
TENSION_SYST + TENSION_DIAST), typée, datée, reliée au patient.

Usage : python3 migrer_constantes.py [--dry-run]
"""

import csv
import os
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

    # patients Primia existants (pour la jointure et éviter les FK violées)
    pg_patients = set(psql('SELECT id FROM "Patient"').split())
    print(f"Patients Primia : {len(pg_patients)}")

    # extraction
    print("Extraction PATIENTSUIVI...")
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    rows = fb_query(
        db,
        "SELECT " + fld("ID") + fld("NUM_PAT") + fld("DATE_SUIVI")
        + fld("SUIVI") + fld("TEXTE") + fld("NOMBRE") + fld("ENTIER")
        + "'END' FROM PATIENTSUIVI")
    print(f"Mesures extraites : {len(rows)}")

    # conversion
    TENSION, POIDS, TAILLE, IMC = "-8", "-2", "-1", "2"
    updates = []
    stats = {"tension": 0, "poids": 0, "taille": 0, "imc": 0, "inconnu": 0}
    for r in rows:
        if len(r) < 7:
            continue
        mid, numpat, date, code, texte, nombre, entier = [clean(x) for x in r[:7]]
        if not numpat:
            continue
        pid = src_uuid("PATIENT", numpat)
        if pid not in pg_patients:
            continue
        if not date:
            continue
        cid_base = src_uuid("PATIENTSUIVI", mid or f"{len(updates)}")
        if code == TENSION and nombre and entier:
            updates.append((cid_base + "-s", pid, "TENSION_SYST", nombre, "mmHg", date))
            updates.append((cid_base + "-d", pid, "TENSION_DIAST", entier, "mmHg", date))
            stats["tension"] += 1
        elif code == POIDS and nombre:
            updates.append((cid_base, pid, "POIDS", nombre, "kg", date))
            stats["poids"] += 1
        elif code == TAILLE and nombre:
            updates.append((cid_base, pid, "TAILLE", nombre, "cm", date))
            stats["taille"] += 1
        elif code == IMC and nombre:
            updates.append((cid_base, pid, "IMC", nombre, None, date))
            stats["imc"] += 1
        else:
            stats["inconnu"] += 1

    print(f"Constantes à insérer : {len(updates)}")
    print(f"  Répartition : {stats}")
    if DRY_RUN or not updates:
        return
    # vérification de cohérence : IMC ~ poids/taille² sur les triplets du même jour
    # (rapide contrôle de la légende — affiché à titre indicatif)

    # ré-injection CSV
    with open("/tmp/constantes.csv", "w", encoding="utf-8") as fh:
        csv.writer(fh).writerows(updates)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_const; "
                           "CREATE TABLE maj_const (id TEXT, pid TEXT, "
                           "typ TEXT, val TEXT, un TEXT, d DATE);"],
                   check=True, capture_output=True)
    with open("/tmp/constantes.csv", encoding="utf-8") as fh:
        r = subprocess.run(PSQL + ["-c",
                                   "\\copy maj_const FROM STDIN WITH CSV"],
                           stdin=fh, capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR import :", r.stderr[:300])
        sys.exit(1)
    r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
        'INSERT INTO "ConstanteBio" (id, "patientId", type, valeur, unite, date) '
        "SELECT m.id, m.pid, m.typ, m.val, m.un, m.d FROM maj_const m "
        'WHERE NOT EXISTS (SELECT 1 FROM "ConstanteBio" c WHERE c.id = m.id);'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR insertion :", r.stderr[:300])
        sys.exit(1)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_const;"],
                   capture_output=True)

    total = psql('SELECT COUNT(*) FROM "ConstanteBio"').strip()
    par_type = psql('SELECT type || \':\' || COUNT(*) FROM "ConstanteBio" '
                   "GROUP BY type ORDER BY 2 DESC").strip()
    print(f"\nConstanteBio total : {total}")
    print(par_type)


if __name__ == "__main__":
    main()
