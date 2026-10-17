#!/usr/bin/env python3
"""Migre PRESCRIPTIONSDET (70 314 lignes MagicMed) -> Traitement (Primia).

Structure validée par sondage :
- PRESCRIPTIONSDET.NUMPRESCRIPTION -> PRESCRIPTIONS (patient, date, suppression)
- VIDALPRODUCT (ID + NAME) ou MEDICAMENTS (NOMCOMMERCIAL) : nom du médicament
- MOMENTPRISE : encodage '&' référençant CONFQUAND (libellés en clair)
- DUREE : texte libre ("1 Semaine", "1 Mois")
- DATE_SUPPR dans PRESCRIPTIONS : traitement actif si non supprimé

Usage : python3 migrer_traitements.py [--dry-run]
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
        raise RuntimeError("Erreur isql : " + out[:400])
    rows = []
    for line in out.splitlines():
        line = line.rstrip("\r")
        if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
            continue
        parts = line.split(SEP, 7)
        if len(parts) == 8 and parts[7] == "END":
            parts = parts[:7]
        rows.append(parts)
    return rows


def clean(v):
    return v.strip() if v and v.strip() else None


def decode_moment(moment_brut, legendes):
    """MOMENTPRISE '1&7&P*0&-1&0&...' -> libellés via CONFQUAND (indices &).
    Format observé : des nombres séparés par & ; les indices (1-based, éventuellement
    négatifs) référencent CONFQUAND. On retient les indices positifs valides."""
    if not moment_brut:
        return None
    trouves = []
    for morceau in moment_brut.split("&"):
        morceau = morceau.strip()
        m = re.match(r"^(\d+)", morceau)
        if m:
            idx = int(m.group(1))
            if 1 <= idx <= len(legendes):
                lib = legendes[idx - 1]
                if lib not in trouves:
                    trouves.append(lib)
    return " ; ".join(trouves) if trouves else None


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

    # 1. légende des moments de prise (CONFQUAND, ordre = index 1-based)
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    print("Légende des moments de prise (CONFQUAND)...")
    rows_quand = fb_query(db, "SELECT " + fld("QUAND") + "'END' FROM CONFQUAND")
    legendes = [clean(r[0]) for r in rows_quand if r and clean(r[0])]
    print(f"  {len(legendes)} moments de prise")

    # 2. noms de médicaments : VIDALPRODUCT.NAME + MEDICAMENTS.NOMCOMMERCIAL
    print("Noms des médicaments (VIDALPRODUCT + MEDICAMENTS)...")
    rows_vidal = fb_query(db, "SELECT " + fld("ID") + fld("NAME") + "'END' FROM VIDALPRODUCT")
    noms = {}
    for r in rows_vidal:
        if len(r) >= 2 and clean(r[0]) and clean(r[1]):
            noms[clean(r[0])] = clean(r[1])
    rows_medoc = fb_query(db, "SELECT " + fld("ID") + fld("NOMCOMMERCIAL") + "'END' FROM MEDICAMENTS")
    for r in rows_medoc:
        if len(r) >= 2 and clean(r[0]) and clean(r[1]):
            if clean(r[0]) not in noms:
                noms[clean(r[0])] = clean(r[1])
    print(f"  {len(noms)} médicaments nommés")

    # 3. prescriptions parentes : numprescription -> (patient, date, supprimé)
    print("Prescriptions parentes...")
    rows_presc = fb_query(
        db,
        "SELECT " + fld("NUMPRESCRIPTION") + fld("NUMPATIENT") + fld("DATECONSULT")
        + fld("DATE_SUPPR") + "'END' FROM PRESCRIPTIONS")
    prescriptions = {}
    for r in rows_presc:
        if len(r) >= 4 and clean(r[0]):
            prescriptions[clean(r[0])] = (clean(r[1]), clean(r[2]), clean(r[3]))
    print(f"  {len(prescriptions)} prescriptions")

    # 4. les lignes de traitements
    print("Lignes PRESCRIPTIONSDET (70k, quelques minutes)...")
    rows = fb_query(
        db,
        "SELECT " + fld("PRESCRIPTIONSDET_ID") + fld("NUMPRESCRIPTION")
        + fld("VIDALPRODUCT") + fld("MEDICAMENT") + fld("DUREE") + fld("MOMENTPRISE")
        + "'END' FROM PRESCRIPTIONSDET")
    print(f"  {len(rows)} lignes extraites")

    updates = []
    sans_nom = 0
    for r in rows:
        if len(r) < 3:
            continue
        lid, numpresc, vidal_id, medicament_libre = [clean(x) for x in r[:4]]
        duree = clean(r[4]) if len(r) > 4 else None
        moment_brut = clean(r[5]) if len(r) > 5 else None
        if not numpresc or numpresc not in prescriptions:
            continue
        numpat, date_consult, date_suppr = prescriptions[numpresc]
        if not numpat:
            continue
        pid = src_uuid("PATIENT", numpat)
        if pid not in pg_patients:
            continue
        nom = noms.get(vidal_id) if vidal_id else None
        if not nom and medicament_libre:
            nom = medicament_libre  # texte libre saisi par le médecin
        if not nom:
            sans_nom += 1
            nom = "Médicament (non identifié)"
        posologie = decode_moment(moment_brut, legendes) or ""
        # actif si la prescription n'est pas supprimée
        actif = date_suppr is None
        # id déterministe
        tid = src_uuid("PRESCRIPTIONSDET", lid) if lid else src_uuid("PRESCRIPTIONSDET", f"{numpresc}-{len(updates)}")
        # colonnes NOT NULL côté Traitement : jamais None dans le CSV
        updates.append((tid, pid, nom,
                         posologie if posologie else "",
                         duree if duree else "",
                         actif, date_consult))

    print(f"Traitements à insérer : {len(updates)} (sans nom : {sans_nom})")
    if DRY_RUN or not updates:
        for t in updates[:5]:
            print("  ex:", t)
        return

    # 5. ré-injection
    with open("/tmp/traitements.csv", "w", encoding="utf-8") as fh:
        csv.writer(fh).writerows(updates)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_trait; "
                           "CREATE TABLE maj_trait (id TEXT, pid TEXT, med TEXT, "
                           "poso TEXT, dur TEXT, act BOOLEAN, d DATE);"],
                   check=True, capture_output=True)
    with open("/tmp/traitements.csv", encoding="utf-8") as fh:
        r = subprocess.run(PSQL + ["-c", "\\copy maj_trait FROM STDIN WITH CSV"],
                           stdin=fh, capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR import :", r.stderr[:300])
        sys.exit(1)
    r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
        'INSERT INTO "Traitement" (id, "patientId", medicament, posologie, duree, actif, "dateDebut") '
        "SELECT m.id, m.pid, m.med, COALESCE(m.poso, ''), COALESCE(m.dur, ''), m.act, m.d FROM maj_trait m "
        'WHERE NOT EXISTS (SELECT 1 FROM "Traitement" t WHERE t.id = m.id);'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR insertion :", r.stderr[:300])
        sys.exit(1)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_trait;"], capture_output=True)

    total = psql('SELECT COUNT(*) FROM "Traitement"').strip()
    actifs = psql('SELECT COUNT(*) FROM "Traitement" WHERE actif').strip()
    print(f"\nTraitement total : {total} (actifs : {actifs})")


if __name__ == "__main__":
    main()
