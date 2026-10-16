#!/usr/bin/env python3
"""Récupère le texte des consultations MagicMed marquées d'un pointeur binaire
(« -8 1 3 1 » / « -8 1 3 2 ») : le texte réel vit dans PRESCRIPTIONS.PRESCRIPTION
(BLOB), joint par CONS_ID -> PATIENTCONSULT.CONS_ID.

Met à jour la table Consultation de Primia avec ce texte (converti depuis le
RTF si nécessaire).

Usage : python3 recupere_textes_consultations.py
"""

import csv
import os
import re
import subprocess
import sys
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, MIG_DIR)
from rtf_vers_html import rtf_vers_html  # noqa: E402

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
SEP = "|||"
FB_ISQL = "/usr/local/firebird/bin/isql"
PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]


def src_uuid(table, pk):
    return str(uuid.uuid5(NS, f"magicmed:{table}:{pk}"))


def fb_query(db, select_sql):
    """Exécute une requête isql, retourne les lignes séparées par SEP."""
    script = (
        f"CONNECT '{db}' USER 'SYSDBA' PASSWORD 'masterkey';\n"
        "SET HEADING OFF;\n"
        f"{select_sql};\n"
    )
    p = subprocess.run(
        ["docker", "exec", "-i", "magicmed-firebird", FB_ISQL, "-ch", "WIN1252"],
        input=script.encode("utf-8"), capture_output=True,
    )
    out = p.stdout.decode("cp1252", errors="replace")
    err = p.stderr.decode("utf-8", errors="replace")
    if "Statement failed" in out or "Statement failed" in err:
        raise RuntimeError("Erreur isql : " + (out + err)[:300])
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


def blob(expr):
    nl = "' || ASCII_CHAR(13) || ASCII_CHAR(10) || '"
    return (f"REPLACE(REPLACE(CAST({expr} AS VARCHAR(32000)), "
            "ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), "
            f"ASCII_CHAR(10), '<NL>') || '{SEP}' ||")


def fld(expr):
    return f"COALESCE(CAST({expr} AS VARCHAR(32000)), '') || '{SEP}' ||"


def clean(v):
    if v is None:
        return None
    v = v.replace("<NL>", "\n")
    return v.strip() if v.strip() else None


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


def main():
    itb = None
    for f in sorted(os.listdir(os.path.join(MIG_DIR, "data"))):
        if f.lower().endswith("-sysdbb.itb"):
            itb = f
            break
    if not itb:
        print("ERREUR : aucune base -sysdbb.itb dans ./data/")
        sys.exit(1)
    db = f"/database/{itb}"
    print(f"Source : {itb}")

    # Combien de consultations Primia ont le marqueur binaire ?
    nb_marquees = psql("SELECT COUNT(*) FROM \"Consultation\" "
                       "WHERE notes IN ('-8 1 3 1', '-8 1 3 2')").strip()
    print(f"Consultations à rattraper : {nb_marquees}")

    # Extraction Firebird : CONS_ID + texte (PRESCRIPTION sinon RESUME)
    print("Extraction des textes depuis PRESCRIPTIONS (peut prendre plusieurs minutes)...")
    rows = fb_query(
        db,
        "SELECT "
        + fld("CONS_ID")
        + fld("RESUME")
        + blob("PRESCRIPTION")
        + "'END' FROM PRESCRIPTIONS WHERE CONS_ID IS NOT NULL AND DATE_SUPPR IS NULL"
    )
    print(f"Textes extraits : {len(rows)}")

    # id_consultation = uuid5(PATIENTCONSULT, CONS_ID) ; texte = RTF->HTML ou brut
    updates = []
    vus = set()
    for r in rows:
        if len(r) < 3:
            continue
        cons_id, resume, prescription = r[0], clean(r[1]), clean(r[2])
        cons_id = clean(cons_id)
        if not cons_id or cons_id in vus:
            continue
        vus.add(cons_id)
        texte = prescription or resume
        if not texte:
            continue
        if "\\rtf1" in texte:
            texte = rtf_vers_html(texte)
        elif not texte.startswith("<p>"):
            # texte brut : le stocker tel quel (l'IHM gère les deux)
            pass
        updates.append((src_uuid("PATIENTCONSULT", cons_id), texte))

    print(f"Consultations avec texte récupéré : {len(updates)}")

    # Ré-injection : CSV -> UPDATE uniquement là où les notes sont un marqueur
    with open("/tmp/textes_consult.csv", "w", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerows(updates)
    subprocess.run(["docker", "cp", "/tmp/textes_consult.csv",
                    "magicmed-postgres:/tmp/textes_consult.csv"],
                   check=True, capture_output=True)
    req = (
        "CREATE TEMP TABLE maj_textes (id TEXT, contenu TEXT); "
        "\\copy maj_textes FROM '/tmp/textes_consult.csv' WITH CSV; "
        "UPDATE \"Consultation\" c SET notes = m.contenu "
        "FROM maj_textes m WHERE c.id = m.id "
        "AND c.notes IN ('-8 1 3 1', '-8 1 3 2');"
    )
    r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c", req],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR psql :", r.stderr[:300])
        sys.exit(1)

    restant = psql("SELECT COUNT(*) FROM \"Consultation\" "
                   "WHERE notes IN ('-8 1 3 1', '-8 1 3 2')").strip()
    print(f"\nRésultat : {nb_marquees} marcateurs -> {restant} restants")
    print("Aperçu d'une consultation mise à jour :")
    print(psql("SELECT LEFT(notes, 250) FROM \"Consultation\" "
               "WHERE notes IS NOT NULL AND notes NOT IN ('-8 1 3 1', '-8 1 3 2') "
               "AND length(notes) > 20 ORDER BY date DESC LIMIT 1"))


if __name__ == "__main__":
    main()
