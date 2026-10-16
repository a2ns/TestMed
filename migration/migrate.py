#!/usr/bin/env python3
"""Migration MagicMed (.ITB, Firebird 2.0/ODS 11) -> Primia (PostgreSQL).

Exécution : python3 migrate.py
Prérequis : conteneurs `magicmed-firebird` et `magicmed-postgres` démarrés
(docker compose up -d), base .ITB dans ./data/, schéma Primia chargé
(le conteneur postgres le charge automatiquement au premier démarrage).

Principe :
  1. Extraction de chaque table source via isql (délimiteur '|||', newlines
     des BLOB échappées, encodage WIN1252 décodé en cp1252).
  2. Transformation en Python (mapping colonnes, UUID déterministes via uuid5
     pour préserver les liens entre tables).
  3. Chargement CSV dans PostgreSQL via \\copy (docker exec psql).
"""

import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(MIG_DIR, "data")
OUT_DIR = os.path.join(MIG_DIR, "out")
ISQL = "/usr/local/firebird/bin/isql"
FB_USER = "SYSDBA"
FB_PASS = "masterkey"
SEP = "|||"
NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid.NAMESPACE_DNS
NOW = datetime.now().isoformat(sep=" ", timespec="seconds")


def src_uuid(table, pk):
    return str(uuid.uuid5(NS, f"magicmed:{table}:{pk}"))


def fb_query(db_path, select_sql):
    """Exécute une requête via isql dans le conteneur, retourne les lignes."""
    script = (
        f"CONNECT '{db_path}' USER '{FB_USER}' PASSWORD '{FB_PASS}';\n"
        "SET HEADING OFF;\nSET LIST OFF;\nSET WIDTH ROW;\n"
        f"{select_sql};\n"
    )
    p = subprocess.run(
        ["docker", "exec", "-i", "magicmed-firebird", ISQL, "-ch", "WIN1252"],
        input=script.encode("utf-8"),
        capture_output=True,
    )
    out = p.stdout.decode("cp1252", errors="replace")
    err = p.stderr.decode("utf-8", errors="replace")
    if "Statement failed" in out or "Statement failed" in err:
        errlines = [l for l in (out + err).splitlines()
                    if "Statement failed" in l or l.startswith("-") or "error" in l.lower()]
        raise RuntimeError("Erreur isql: " + " | ".join(errlines[:5])
                           + f"\nRequête: {select_sql[:200]}")
    rows = []
    for line in out.splitlines():
        line = line.rstrip("\r")
        if not line.strip() or line.startswith(("Use CONNECT", "Database:")):
            continue
        rows.append(line.split(SEP))
    return rows


def blob(expr):
    """Échappe une colonne BLOB pour l'extraction une-ligne-par-ligne."""
    nl = f"' || ASCII_CHAR(13) || ASCII_CHAR(10) || '"
    return f"REPLACE(REPLACE(CAST({expr} AS VARCHAR(32000)), ASCII_CHAR(13)||ASCII_CHAR(10), '<NL>'), ASCII_CHAR(10), '<NL>')"


def fld(expr):
    return f"COALESCE(CAST({expr} AS VARCHAR(32000)), '')"


def q(expr, alias):
    return f"({expr}) || '{SEP}' ||"


def pg_copy(table, columns, csv_path):
    cols = ", ".join(f'"{c}"' for c in columns)
    with open(csv_path, "rb") as f:
        subprocess.run(
            ["docker", "exec", "-i", "magicmed-postgres", "psql",
             "-U", "primia", "-d", "primia",
             "-c", f"\\copy \"{table}\" ({cols}) FROM STDIN WITH (FORMAT csv)"],
            stdin=f, check=True,
        )


def pg_sql(sql):
    subprocess.run(
        ["docker", "exec", "-i", "magicmed-postgres", "psql",
         "-U", "primia", "-d", "primia", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True,
    )


def clean(v):
    if v is None:
        return None
    v = v.replace("<NL>", "\n")
    return v.strip() if v.strip() else None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    itb = None
    for f in sorted(os.listdir(DATA_DIR)):
        if f.lower().endswith("-sysdbb.itb"):
            itb = os.path.join(DATA_DIR, f)
            break
    if not itb:
        for f in sorted(os.listdir(DATA_DIR)):
            if f.lower().endswith(".itb") and "patched" not in f.lower() and "sysdbb" not in f.lower():
                src = os.path.join(DATA_DIR, f)
                itb = src[:-4] + "-sysdbb.itb"
                print(f"Patch du rôle bloquant -> {os.path.basename(itb)}")
                subprocess.run(["python3", os.path.join(MIG_DIR, "patch_role.py"), src, itb], check=True)
                break
    if not itb:
        print("ERREUR : aucun .ITB (non patché) dans ./data/")
        sys.exit(1)
    db = f"/database/{os.path.basename(itb)}"
    print(f"Source : {os.path.basename(itb)}")

    # ---------- PATIENT -> Patient ----------
    print("1/6 Patients...")
    rows = fb_query(
        db,
        "SELECT "
        + q("NUM_PAT", "")
        + q(fld("NOM_PAT"), "")
        + q(fld("PRE_PAT"), "")
        + q(fld("BIRTH_PAT"), "")
        + q(fld("NSS_PAT"), "")
        + q(fld("SEXE"), "")
        + q(fld("ADRESSE1"), "")
        + q(fld("CPADRPAT"), "")
        + q(fld("VILLEPAT"), "")
        + q(fld("TELPERSO"), "")
        + q(fld("PORTABLE"), "")
        + q(fld("EMAIL"), "")
        + q(fld("LASTACCES"), "")
        + "'END' FROM PATIENT",
    )
    path = os.path.join(OUT_DIR, "patients.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        for r in rows:
            if len(r) != 14:
                continue
            num, nom, pre, dn, nir, sexe, adr, cp, ville, tel1, tel2, email, _, _ = r
            adresse = " - ".join(x for x in (clean(adr), clean(cp), clean(ville)) if x)
            w.writerow([
                src_uuid("PATIENT", clean(num) or n),
                clean(nom) or "?", clean(pre) or "?",
                clean(dn) or None, clean(nir), clean(sexe),
                adresse or None, clean(tel1) or clean(tel2), clean(email),
                None, None, NOW,
            ])
            n += 1
    pg_copy("Patient",
            ["id", "nom", "prenoms", "dateNaissance", "nirChiffre", "sexe",
             "adresse", "telephone", "email", "carteVitale", "medecinTraitant",
             "updatedAt"],
            path)
    print(f"   {n} patients")

    # ---------- DONNEEPRATICIEN -> Praticien ----------
    print("2/6 Praticiens...")
    rows = fb_query(
        db,
        "SELECT "
        + q("NUSER", "")
        + q(fld("NOMPRATICIEN"), "")
        + q(fld("PRENOMPRATICIEN"), "")
        + q(fld("RPPS"), "")
        + q(fld("SPECIALITE"), "")
        + "'END' FROM DONNEEPRATICIEN",
    )
    path = os.path.join(OUT_DIR, "praticiens.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        vus = set()
        for r in rows:
            if len(r) != 6:
                continue
            num, nom, pre, rpps, spec = r[:5]
            if not clean(nom) or clean(num) in vus:
                continue
            vus.add(clean(num))
            w.writerow([
                src_uuid("DONNEEPRATICIEN", clean(num) or n),
                clean(nom), clean(pre) or "-", clean(rpps),
                clean(spec), "{MEDECIN}", True,
            ])
            n += 1
    pg_copy("Praticien",
            ["id", "nom", "prenoms", "rpps", "specialite", "roles", "actif"],
            path)
    print(f"   {n} praticiens")

    # ---------- PATIENTCONSULT -> Consultation ----------
    print("3/6 Consultations...")
    rows = fb_query(
        db,
        "SELECT "
        + q("CONS_ID", "")
        + q("NUM_PAT", "")
        + q("PRATICIEN", "")
        + q("DATE_CONSULT", "")
        + q(blob("CONSULTATION"), "")
        + "'END' FROM PATIENTCONSULT WHERE DATE_SUPPR IS NULL",
    )
    path = os.path.join(OUT_DIR, "consultations.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        vus = set()
        for r in rows:
            if len(r) != 6:
                continue
            cid, numpat, prat, dte, texte = r[:5]
            if cid in vus:
                continue
            vus.add(cid)
            numpat = clean(numpat)
            if not numpat:
                continue
            w.writerow([
                src_uuid("PATIENTCONSULT", clean(cid) or n),
                src_uuid("PATIENT", numpat),
                src_uuid("DONNEEPRATICIEN", clean(prat)) if clean(prat) else None,
                None, clean(texte), clean(dte),
            ])
            n += 1
    pg_copy("Consultation",
            ["id", "patientId", "praticienId", "motif", "notes", "date"],
            path)
    print(f"   {n} consultations")

    # ---------- DOCUMENT -> Document ----------
    print("4/6 Documents (GED)...")
    rows = fb_query(
        db,
        "SELECT "
        + q("IDDOC", "")
        + q("NUM_PAT", "")
        + q(fld("OBJET"), "")
        + q("TYPEDOCUMENT", "")
        + q("DATEDOCUMENT", "")
        + q(fld("ETIQUETTE"), "")
        + "'END' FROM DOCUMENT",
    )
    path = os.path.join(OUT_DIR, "documents.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        vus = set()
        for r in rows:
            if len(r) != 7:
                continue
            idoc, numpat, objet, typedoc, dte, etiqu = r[:6]
            if idoc in vus:
                continue
            vus.add(idoc)
            numpat = clean(numpat)
            nom = clean(etiqu) or clean(objet) or f"document {clean(idoc) or n}"
            w.writerow([
                src_uuid("DOCUMENT", clean(idoc) or n),
                src_uuid("PATIENT", numpat) if numpat else None,
                nom[:200],
                f"migration/document/{clean(idoc) or n}",
                "AUTRE", None, clean(dte),
            ])
            n += 1
    pg_copy("Document",
            ["id", "patientId", "nomFichier", "cheminStockage", "type",
             "ocrTexte", "createdAt"],
            path)
    print(f"   {n} documents")

    # ---------- MODELEDOCUMENT -> GabaritCourrier ----------
    print("5/6 Gabarits de documents...")
    rows = fb_query(
        db,
        "SELECT m.IDMODELE, e.LIBELLE, " + blob("m.COMMENTAIRE")
        + " || '" + SEP + "' || 'END'"
        " FROM MODELEDOCUMENT m JOIN MODELEDOCUMENTENT e ON e.IDMODELE = m.IDMODELE",
    )
    path = os.path.join(OUT_DIR, "gabarits.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        vus = set()
        for r in rows:
            if len(r) != 4:
                continue
            idm, lib, com = r[:3]
            if idm in vus:
                continue
            vus.add(idm)
            if not clean(idm):
                continue
            w.writerow([
                src_uuid("MODELEDOCUMENT", clean(idm)),
                f"magicmed-{clean(idm)}",
                (clean(lib) or f"Gabarit {clean(idm)}")[:100],
                clean(com) or "(contenu non extrait)",
            ])
            n += 1
    pg_copy("GabaritCourrier", ["id", "code", "libelle", "contenu"], path)
    print(f"   {n} gabarits")

    # ---------- PRESCRIPTIONS -> Courrier ----------
    print("6/6 Courriers (textes de consultation / ordonnances)...")
    rows = fb_query(
        db,
        "SELECT "
        + q("NUMPRESCRIPTION", "")
        + q("NUMPATIENT", "")
        + q(fld("MODALITE"), "")
        + q(fld("RESUME"), "")
        + blob("PRESCRIPTION")
        + "'END' FROM PRESCRIPTIONS WHERE DATE_SUPPR IS NULL",
    )
    path = os.path.join(OUT_DIR, "courriers.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        vus = set()
        for r in rows:
            if len(r) != 6:
                continue
            nump, numpat, modal, res, txt = r[:5]
            if nump in vus:
                continue
            vus.add(nump)
            numpat = clean(numpat)
            if not numpat:
                continue
            contenu = clean(txt) or clean(res)
            if not contenu:
                continue
            w.writerow([
                src_uuid("PRESCRIPTIONS", clean(nump) or n),
                src_uuid("PATIENT", numpat),
                (clean(res) or clean(modal) or "Document")[:200],
                contenu, False, "VALIDE", None,
            ])
            n += 1
    pg_copy("Courrier",
            ["id", "patientId", "sujet", "contenu", "aiGenere", "statut", "validePar"],
            path)
    print(f"   {n} courriers")

    print("\n=== Migration terminée. Vérification des volumes : ===")
    for t in ["Patient", "Praticien", "Consultation", "Document",
              "GabaritCourrier", "Courrier"]:
        r = subprocess.run(
            ["docker", "exec", "magicmed-postgres", "psql", "-U", "primia",
             "-d", "primia", "-tAc", f'SELECT count(*) FROM "{t}"'],
            capture_output=True, text=True,
        )
        print(f"   {t:16} {r.stdout.strip()}")


if __name__ == "__main__":
    main()
