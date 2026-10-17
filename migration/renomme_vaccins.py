#!/usr/bin/env python3
"""Renomme les vaccinations MagicMed à partir d'une correspondance ID -> nom.

Usage : éditez la CORRESPONDANCE ci-dessous (les noms donnés par le médecin),
puis lancez : python3 renomme_vaccins.py

Les vaccinations déjà migrées ("Vaccin #N") sont renommées en place.
Les IDs non listés gardent leur libellé "Vaccin #N".
"""

import subprocess
import sys

PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]

# Correspondance ID MagicMed (VACCINS.ID) -> nom du vaccin.
# Fréquences observées (nombre de patients) pour aider la reconnaissance.
CORRESPONDANCE = {
    "32": "Grippe saisonnière",          # 78 patients
    "5": "",                             # 51 patients
    "35": "",                            # 47 patients
    "41": "",                            # 45 patients
    "21": "",                            # 42 patients
    "33": "",                            # 41 patients
    "36": "",                            # 39 patients
    "19": "",                            # 34 patients
    "28": "",                            # 27 patients
    "53": "",                            # 20 patients
    # ... compléter les autres IDs au besoin
}


def main():
    faits = 0
    for vid, nom in CORRESPONDANCE.items():
        if not nom:
            continue
        r = subprocess.run(
            PSQL + ["-tAc",
                     f"UPDATE \"Vaccination\" SET vaccin = '{nom}' "
                     f"WHERE vaccin = 'Vaccin #{vid}';"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print(f"ERREUR ID {vid} :", r.stderr[:200])
            sys.exit(1)
        print(f"  Vaccin #{vid} -> {nom} : {r.stdout.strip()} lignes")
        faits += 1
    print(f"\n{faits} types renommés")
    # état final
    r = subprocess.run(PSQL + ["-tAc",
                               'SELECT vaccin || \' (\' || COUNT(*) || \')\' '
                               'FROM "Vaccination" GROUP BY vaccin '
                               'ORDER BY COUNT(*) DESC LIMIT 15'],
                      capture_output=True, text=True)
    print(r.stdout)


if __name__ == "__main__":
    main()
