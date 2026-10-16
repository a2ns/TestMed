#!/usr/bin/env python3
"""Récupère le texte des consultations MagicMed au format RichView (Delphi) :
les BLOB CONSULTATION « binaires » (194 580 lignes) contiennent le compte rendu
en format interne RichView (paires d'octets + marqueurs + feuille de style).

Canal d'extraction : isql sort les BLOB en hexadécimal via CAST(... OCTETS) ?
Non — FB 2.0 ne l'offre pas proprement en texte. Voie robuste : utiliser
l'outil GBAK ? Trop lourd. La voie retenue : extraire via isql en HEX n'existe
pas, mais l'on peut passer par l'export en hex avec l'UDF ? Le plus fiable
disponible : utiliser le canal CSV de PostgreSQL pour la ré-injection, et pour
l'EXTRACTION Firebird, caster le BLOB en VARCHAR(32000) — le contenu est de
l'ASCII (marqueurs + paires), donc le CAST fonctionne (c'est seulement le
LEFT(CAST(...)) court qui tronquait violemment).

Usage : python3 recupere_richview.py [--dry-run]
"""

import csv
import os
import subprocess
import sys
import uuid

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, MIG_DIR)
from decode_richview import decode_richview, vers_html  # noqa: E402

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
DRY_RUN = "--dry-run" in sys.argv
SEP = "|||"
FB_ISQL = "/usr/local/firebird/bin/isql"
PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]


def src_uuid(table, pk):
    return str(uuid.uuid5(NS, f"magicmed:{table}:{pk}"))


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


def fb_query(db, select_sql):
    """Requête isql ; les BLOB sont castés en VARCHAR(32000) par l'appelant."""
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
        raise RuntimeError(f"Erreur isql : {(out + err)[:400]}")
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


def main():
    # 0. base source
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

    # 1. les consultations Primia encore marquées
    nb = psql("SELECT COUNT(*) FROM \"Consultation\" "
              "WHERE notes IN ('-8 1 3 1', '-8 1 3 2')").strip()
    print(f"Consultations encore marquées : {nb}")
    if nb == "0":
        print("Rien à faire.")
        return

    # 2. leurs CONS_ID d'origine (uuid5 inversé impossible : on garde la table
    #    de correspondance CONS_ID -> id en réutilisant le même uuid5)
    #    Extraire CONS_ID + BLOB depuis Firebird, par lots.
    print("Liste des CONS_ID concernés (depuis Firebird)...")
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    rows_ids = fb_query(
        db,
        "SELECT " + fld("CONS_ID") + "'END' FROM PATIENTCONSULT "
        "WHERE DATE_SUPPR IS NULL")
    tous_ids = [r[0].strip() for r in rows_ids if r and r[0].strip()]
    print(f"Consultations source : {len(tous_ids)}")

    # 3. extraction par lots avec décoding
    TAILLE_LOT = 300
    updates = []
    erreurs = 0
    for i in range(0, len(tous_ids), TAILLE_LOT):
        lot = tous_ids[i:i + TAILLE_LOT]
        sel = ("SELECT "
               + fld("CONS_ID")
               + fld("CAST(CONSULTATION AS VARCHAR(32000))")
               + "'END' FROM PATIENTCONSULT WHERE CONS_ID IN ("
               + ",".join(lot) + ")")
        try:
            rows = fb_query(db, sel)
        except RuntimeError as e:
            erreurs += 1
            continue
        for r in rows:
            if len(r) < 2:
                continue
            cons_id = r[0].strip()
            brut = r[1]
            texte = decode_richview(brut.encode("cp1252", errors="replace"))
            if texte and len(texte.strip()) > 5:
                updates.append((src_uuid("PATIENTCONSULT", cons_id),
                                vers_html(texte)))
        if (i // TAILLE_LOT) % 50 == 0:
            print(f"   lot {i // TAILLE_LOT + 1}/{(len(tous_ids) + TAILLE_LOT - 1) // TAILLE_LOT} ({len(updates)} textes)")

    print(f"Textes RichView décodés : {len(updates)} (lots en erreur : {erreurs})")
    if DRY_RUN or not updates:
        if DRY_RUN and updates:
            print("Aperçu :")
            for _id, t in updates[:3]:
                print(" ", t[:200])
        return

    # 4. ré-injection (canal CSV robuste)
    with open("/tmp/rv_updates.csv", "w", encoding="utf-8") as fh:
        csv.writer(fh).writerows(updates)
    subprocess.run(["docker", "cp", "/tmp/rv_updates.csv",
                    "magicmed-postgres:/tmp/rv_updates.csv"],
                   check=True, capture_output=True)
    subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_rv; "
                           "CREATE TABLE maj_rv (id TEXT, contenu TEXT);"],
                   check=True, capture_output=True)
    r = subprocess.run(PSQL + ["-c",
                               "\\copy maj_rv FROM '/tmp/rv_updates.csv' WITH CSV"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR import CSV :", r.stderr[:300])
        sys.exit(1)
    r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
                               'UPDATE "Consultation" c SET notes = m.contenu '
                               "FROM maj_rv m WHERE c.id = m.id "
                               "AND c.notes IN ('-8 1 3 1', '-8 1 3 2');"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR psql :", r.stderr[:300])
        sys.exit(1)

    restant = psql("SELECT COUNT(*) FROM \"Consultation\" "
                   "WHERE notes IN ('-8 1 3 1', '-8 1 3 2')").strip()
    print(f"\nRésultat : {nb} marquées -> {restant} restantes")
    print("Aperçu :")
    print(psql("SELECT LEFT(notes, 250) FROM \"Consultation\" "
               "WHERE notes LIKE '<p>%' ORDER BY date DESC LIMIT 1"))


if __name__ == "__main__":
    main()
