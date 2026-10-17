#!/usr/bin/env python3
"""Récupère le texte des consultations MagicMed :
- BLOB RichView (marqueurs + style + texte en paires d'octets) -> décodage
- BLOB RTF -> conversion via rtf_vers_html

Cible UNIQUEMENT les consultations Primia encore marquées
(notes IN ('-8 1 3 1', '-8 1 3 2')).

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
from rtf_vers_html import rtf_vers_html  # noqa: E402

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

    # 1. consultations Primia à re-traiter : marqueurs + notes stériles
    #    (HTML vide/quasi vide issus des rattrapages précédents)
    CRITERE = ("notes IN ('-8 1 3 1', '-8 1 3 2') "
               "OR notes = '<p></p>' "
               "OR notes IS NULL "
               "OR notes LIKE '%HelloDoc%' "
               "OR notes LIKE '%*VID*%' "
               "OR (notes LIKE '<p>%' AND length(notes) < 40)")
    nb = psql("SELECT COUNT(*) FROM \"Consultation\" "
              "WHERE " + CRITERE).strip()
    print(f"Consultations à re-traiter (marqueurs + stériles) : {nb}")
    if nb == "0":
        print("Rien à faire.")
        return
    lignes_marquees = psql("SELECT id || '|' || COALESCE(\"patientId\", '') "
                           "FROM \"Consultation\" "
                           "WHERE " + CRITERE).splitlines()
    marquees_par_patient = {}
    marques = set()
    for l in lignes_marquees:
        if "|" not in l:
            continue
        cid, pid = l.split("|", 1)
        cid = cid.strip()
        pid = pid.strip()
        marques.add(cid)
        if pid:
            marquees_par_patient.setdefault(pid, []).append(cid)
    print(f"UUIDs marqués chargés : {len(marques)} "
          f"({len(marquees_par_patient)} patients concernés)")

    # 2. CONS_ID de toutes les consultations source
    fld = lambda e: f"COALESCE(CAST({e} AS VARCHAR(32000)), '') || '{SEP}' ||"
    # échappement des sauts de ligne (CRITICAL : les BLOB multi-lignes sinon
    # fragmentés par le parsing ligne à ligne)
    # ATTENTION : remplacer CRLF d'abord, puis CR seul, puis LF seul.
    # Le format RichView utilise des CR solitaires comme séparateurs —
    # ne pas les échapper tronquait le BLOB au premier marqueur
    # (cause historique du « -8 1 3 1 » dans la migration initiale !).
    blob_esc = ("REPLACE(REPLACE(REPLACE(CAST(CONSULTATION AS VARCHAR(32000)), "
                "ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), "
                "ASCII_CHAR(13), '<NL>'), "
                "ASCII_CHAR(10), '<NL>')")
    print("Liste des CONS_ID (depuis Firebird)...")
    rows_ids = fb_query(db, "SELECT " + fld("CONS_ID") + "'END' FROM PATIENTCONSULT "
                        "WHERE DATE_SUPPR IS NULL")
    tous_ids = [r[0].strip() for r in rows_ids if r and r[0].strip()]
    print(f"Consultations source : {len(tous_ids)}")

    # 3. extraction par lots : CONS_ID + NUM_PAT + DATE + BLOB
    #    la jointure se fait par UUID patient (dérivable de NUM_PAT)
    TAILLE_LOT = 300
    updates = []
    dates = []
    erreurs = 0
    vus = set()
    stats_lot0 = {"trouvees": 0, "sans_patient_marque": 0, "blob_vide": 0,
                  "champs_manquants": 0, "candidats": 0}
    for i in range(0, len(tous_ids), TAILLE_LOT):
        lot = tous_ids[i:i + TAILLE_LOT]
        sel = ("SELECT "
               + fld("CONS_ID")
               + fld("NUM_PAT")
               + fld("DATE_CONSULT")
               + "COALESCE(" + blob_esc + ", '') || '" + SEP + "' || "
               + "'END' FROM PATIENTCONSULT WHERE CONS_ID IN ("
               + ",".join(lot) + ")")
        try:
            rows = fb_query(db, sel)
        except RuntimeError:
            erreurs += 1
            continue
        for r in rows:
            if len(r) < 4:
                continue
            cons_id, numpat, dte, brut = r[0].strip(), r[1].strip(), r[2].strip(), r[3]
            brut = brut.replace("<NL>", "\r")
            if not numpat:
                continue
            pid_uuid = src_uuid("PATIENT", numpat)
            cibles = marquees_par_patient.get(pid_uuid)
            if i == 0:
                # comptage des causes d'échec sur le premier lot
                stats_lot0["trouvees"] += 1
                if cibles is None:
                    stats_lot0["sans_patient_marque"] += 1
                elif not brut.strip():
                    stats_lot0["blob_vide"] += 1
                elif len(r) < 4:
                    stats_lot0["champs_manquants"] += 1
                else:
                    stats_lot0["candidats"] += 1
                if stats_lot0["trouvees"] <= 2:
                    print(f"   DEBUG r={len(r)} champs : cons_id={r[0][:20]!r} "
                          f"numpat={r[1][:10]!r} date={r[2][:15]!r} brut={brut[:40]!r}")
            if not cibles:
                continue  # aucune marquée pour ce patient
            # prendre une consultation marquée non encore traitée pour ce patient
            cid_uuid = None
            for c in cibles:
                if c not in vus:
                    cid_uuid = c
                    break
            if not cid_uuid:
                continue  # toutes celles de ce patient déjà traitées
            vus.add(cid_uuid)
            if not brut.strip():
                continue
            try:
                if brut.lstrip().startswith("{\\rtf"):
                    html = rtf_vers_html(brut.strip())
                else:
                    texte = decode_richview(brut.encode("cp1252", errors="replace"))
                    html = vers_html(texte)
            except Exception:
                continue
            if html and html.strip() not in ("", "<p></p>", "<p><br></p>"):
                updates.append((cid_uuid, html))
                if dte:
                    dates.append((cid_uuid, dte))
        if (i // TAILLE_LOT) % 50 == 0:
            print(f"   lot {i // TAILLE_LOT + 1}/{(len(tous_ids) + TAILLE_LOT - 1) // TAILLE_LOT} ({len(updates)} textes)")

    print(f"Textes décodés pour consultations marquées : {len(updates)} "
          f"(lots en erreur : {erreurs})")
    print(f"Stats 1er lot : {stats_lot0}")
    if DRY_RUN:
        if updates:
            print("Aperçu :")
            for _id, t in updates[:3]:
                print(" ", t[:250])
        return
    if not updates:
        print("Aucune mise à jour à faire.")
        return

    # 4. ré-injection CSV
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
                               "AND (c.notes IN ('-8 1 3 1', '-8 1 3 2') "
                               "OR c.notes = '<p></p>' "
                               "OR c.notes IS NULL "
                               "OR c.notes LIKE '%HelloDoc%' "
                               "OR c.notes LIKE '%*VID*%' "
                               "OR (c.notes LIKE '<p>%' AND length(c.notes) < 40));"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("ERREUR psql :", r.stderr[:300])
        sys.exit(1)

    # restauration des vraies dates (la migration initiale les avait écrasées
    # par DEFAULT now())
    if dates:
        with open("/tmp/rv_dates.csv", "w", encoding="utf-8") as fh:
            csv.writer(fh).writerows(dates)
        subprocess.run(["docker", "cp", "/tmp/rv_dates.csv",
                        "magicmed-postgres:/tmp/rv_dates.csv"],
                       check=True, capture_output=True)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_dates; "
                               "CREATE TABLE maj_dates (id TEXT, d DATE);"],
                       check=True, capture_output=True)
        r = subprocess.run(PSQL + ["-c",
                                   "\\copy maj_dates FROM '/tmp/rv_dates.csv' WITH CSV"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR import dates :", r.stderr[:300])
            sys.exit(1)
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
                                   'UPDATE "Consultation" c SET date = m.d '
                                   "FROM maj_dates m WHERE c.id = m.id "
                                   "AND c.date::date = CURRENT_DATE;"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR psql dates :", r.stderr[:300])
            sys.exit(1)
        print(f"{len(dates)} dates restaurées")

    restant = psql("SELECT COUNT(*) FROM \"Consultation\" "
                   "WHERE " + CRITERE).strip()
    print(f"\nRésultat : {nb} marquées -> {restant} restantes")
    print("Aperçu d'une note mise à jour :")
    print(psql("SELECT LEFT(notes, 250) FROM \"Consultation\" "
               "WHERE notes LIKE '<p>%' AND length(notes) > 30 "
               "ORDER BY date DESC LIMIT 1"))


if __name__ == "__main__":
    main()
