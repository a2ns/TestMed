#!/usr/bin/env python3
"""Primia Migrator — outil de migration MagicMed (.ITB) -> Primia (PostgreSQL).

Un seul script qui enchaîne TOUTE la migration, dans l'ordre validé :

  1. analyse        : vérifie la base, affiche les volumes des 108 tables
  2. patch          : copie patchée SYSDBA->SYSDBB (contournement du verrou éditeur)
  3. schema         : (re)crée le schéma Primia complet dans PostgreSQL
  4. patients       : patients, praticiens, consultations, documents, gabarits
  5. courriers      : courriers/ordonnances (PRESCRIPTIONS -> Courrier)
  6. rtf            : conversion des notes RTF en HTML (gras/italique/listes)
  7. richview       : décodage du format RichView (comptes rendus en paires
                      d'octets) + restauration des vraies dates
  8. nettoyage      : RTF coquilles -> NULL, HTML vides -> NULL

Usage :
  python3 migrator.py                # tout, dans l'ordre
  python3 migrator.py --dry-run      # analyse seulement (aucune écriture)
  python3 migrator.py --etapes 4,5   # seulement certaines étapes
  python3 migrator.py --liste        # lister les étapes

Prérequis : conteneurs magicmed-firebird et magicmed-postgres démarrés
(docker-compose up -d), base .ITB dans ./data/.

Ce script est idempotent : chaque étape peut être relancée ; les étapes
de rattrapage ne réécrivent que les consultations dont les notes sont
marqueurs/NULL/coquilles — jamais les textes déjà convertis.
"""

import os
import subprocess
import sys

MIG_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, MIG_DIR)

ETAPE_DESCRIPTIONS = [
    (1, "analyse",   "volumes des tables MagicMed"),
    (2, "patch",     "copie patchée SYSDBA->SYSDBB (verrou éditeur)"),
    (3, "schema",    "schéma Primia complet dans PostgreSQL"),
    (4, "patients",  "patients + praticiens + consultations + documents + gabarits"),
    (5, "courriers", "courriers/ordonnances (PRESCRIPTIONS)"),
    (6, "rtf",       "conversion RTF -> HTML (consultations + courriers)"),
    (7, "richview",  "décodage RichView + restauration des dates"),
    (8, "nettoyage", "coquilles vides -> NULL"),
    (9, "constantes", "PATIENTSUIVI -> ConstanteBio (tension/poids/taille/IMC)"),
]


def trouver_itb():
    """Retourne le chemin de la base : copie patchée si présente, sinon l'originale."""
    data = os.path.join(MIG_DIR, "data")
    for f in sorted(os.listdir(data)):
        if f.lower().endswith("-sysdbb.itb"):
            return os.path.join("data", f), True
    for f in sorted(os.listdir(data)):
        if f.lower().endswith(".itb") and "patched" not in f.lower():
            return os.path.join("data", f), False
    return None, False


def conteneurs_prets():
    r = subprocess.run(["docker", "ps", "--format", "{{.Names}}"],
                       capture_output=True, text=True)
    actifs = set(r.stdout.split())
    return "magicmed-firebird" in actifs and "magicmed-postgres" in actifs


def etape_analyse():
    r = subprocess.run(["bash", os.path.join(MIG_DIR, "compte_tables.sh")],
                       cwd=MIG_DIR)
    return r.returncode == 0


def etape_patch():
    import patch_role
    src, _ = trouver_itb()
    if src is None:
        print("ERREUR : aucune base .ITB dans ./data/")
        return False
    if src.endswith("-sysdbb.itb"):
        print("Copie patchée déjà présente :", src)
        return True
    dst = src[:-4] + "-sysdbb.itb"
    patch_role.main_silencieux(src, dst) if hasattr(patch_role, "main_silencieux") else \
        subprocess.run(["python3", os.path.join(MIG_DIR, "patch_role.py"), src, dst],
                       cwd=MIG_DIR, check=True)
    print("Copie patchée créée :", dst)
    return True


def etape_schema():
    # le volume postgres est recréé par l'appelant si besoin ; ici on rejoue
    # le schéma en s'assurant qu'il est appliqué
    psql = ["docker", "exec", "-i", "magicmed-postgres", "psql",
            "-U", "primia", "-d", "primia"]
    # le schéma ne s'applique que sur une base vide : vérifier
    r = subprocess.run(psql + ["-tAc", "SELECT COUNT(*) FROM information_schema.tables "
                               "WHERE table_schema = 'public'"],
                       capture_output=True, text=True)
    nb = r.stdout.strip()
    if nb not in ("0", ""):
        print(f"Base déjà peuplée ({nb} tables) — schéma ignoré "
              "(passez par docker volume rm pour repartir de zéro)")
        return True
    schema = os.path.join(MIG_DIR, "schema.sql")
    with open(schema, "rb") as f:
        r = subprocess.run(psql + ["-v", "ON_ERROR_STOP=1"], stdin=f,
                           capture_output=True)
    if r.returncode != 0:
        print("ERREUR schéma :", r.stderr.decode()[:300])
        return False
    print("Schéma Primia appliqué (15 tables + gabarits)")
    return True


def etape_migrate(args):
    """Étapes 4 et 5 : délègue à migrate.py (qui gère tout le mapping)."""
    r = subprocess.run(["python3", os.path.join(MIG_DIR, "migrate.py")],
                       cwd=MIG_DIR)
    return r.returncode == 0


def etape_rtf():
    r = subprocess.run(["python3", os.path.join(MIG_DIR, "rtf_vers_html.py")],
                       cwd=MIG_DIR)
    return r.returncode == 0


def etape_richview():
    r = subprocess.run(["python3", os.path.join(MIG_DIR, "recupere_richview.py")],
                       cwd=MIG_DIR)
    return r.returncode == 0


def etape_nettoyage():
    psql = ["docker", "exec", "-i", "magicmed-postgres", "psql",
            "-U", "primia", "-d", "primia", "-v", "ON_ERROR_STOP=1"]
    requetes = [
        # RTF coquilles (entête sans texte) -> NULL
        'UPDATE "Consultation" SET notes = NULL '
        "WHERE notes IS NOT NULL AND LEFT(notes, 5) = '{\\rtf'",
        # HTML vides -> NULL
        'UPDATE "Consultation" SET notes = NULL WHERE notes = \'<p></p>\'',
        # RTF coquilles côté courriers (contenu NOT NULL -> chaîne vide)
        'UPDATE "Courrier" SET contenu = \'\' '
        "WHERE LEFT(contenu, 5) = '{\\rtf'",
        'UPDATE "Courrier" SET contenu = \'\' WHERE contenu = \'<p></p>\'',
    ]
    for req in requetes:
        r = subprocess.run(psql + ["-c", req], capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR nettoyage :", r.stderr[:200])
            return False
        print("  ", r.stdout.strip())
    # radiographie finale
    r = subprocess.run(psql + ["-c",
        'SELECT CASE '
        "WHEN notes LIKE '<p>%' THEN 'HTML avec contenu' "
        "WHEN notes IS NULL THEN 'NULL (jamais rédigée)' "
        "ELSE 'AUTRE' END AS type, COUNT(*) "
        'FROM "Consultation" GROUP BY 1'],
        capture_output=True, text=True)
    print(r.stdout)
    return True


def etape_constantes():
    r = subprocess.run(["python3", os.path.join(MIG_DIR, "migrer_constantes.py")],
                       cwd=MIG_DIR)
    return r.returncode == 0


def main():
    args = sys.argv[1:]
    if "--liste" in args:
        for n, nom, desc in ETAPE_DESCRIPTIONS:
            print(f"  {n}. {nom:12} — {desc}")
        return
    dry = "--dry-run" in args
    etapes_voulues = None
    if "--etapes" in args:
        i = args.index("--etapes")
        etapes_voulues = {int(x) for x in args[i + 1].split(",")}

    print("=" * 60)
    print("Primia Migrator — MagicMed -> Primia")
    print("=" * 60)

    src, patched = trouver_itb()
    print(f"Base source : {src or 'AUCUNE'}"
          f"{' (patchée)' if patched else ' (originale)'}")
    if src is None:
        print("ERREUR : placez un fichier .ITB dans ./data/")
        sys.exit(1)
    if not conteneurs_prets():
        print("ERREUR : lancez d'abord  docker-compose up -d "
              "(conteneurs magicmed-firebird et magicmed-postgres)")
        sys.exit(1)
    print("Conteneurs : OK")

    for n, nom, desc in ETAPE_DESCRIPTIONS:
        if etapes_voulues is not None and n not in etapes_voulues:
            continue
        print(f"\n--- Étape {n}/9 : {nom} ({desc}) ---")
        if dry and n > 1:
            print("  [dry-run] ignorée")
            continue
        fonctions = {
            "analyse": etape_analyse,
            "patch": etape_patch,
            "schema": etape_schema,
            "patients": etape_migrate,
            "courriers": etape_migrate,
            "rtf": etape_rtf,
            "richview": etape_richview,
            "nettoyage": etape_nettoyage,
            "constantes": etape_constantes,
        }
        ok = fonctions[nom](None)
        if not ok:
            print(f"Étape {n} ({nom}) ÉCHOUÉE — corrigez puis relancez "
                  f"(--etapes {n} pour reprendre ici)")
            sys.exit(1)

    print("\n" + "=" * 60)
    print("Migration terminée.")
    print("Lancez Primia avec :")
    print("  export DATABASE_URL=\"postgres://primia:primia@localhost:54329/primia\"")
    print("  cd apps/desktop && npm run tauri dev")


if __name__ == "__main__":
    main()
