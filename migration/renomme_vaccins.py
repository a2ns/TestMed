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
    "25": "Vaxigrip tétra",       # 66 ans, lots E02 campagne
    "19": "Prevenar 13",          # nourrissons, lots X3C241V Pfizer
    "21": "Bexsero",              # nourrissons, lots A21CD/A GSK
    "36": "Zostavax",             # 58 ans, lots P3K310V Merck
    "5":  "Infanrix Hexa",        # 2 ans, lots ABX GSK
    "32": "Pentavac",             # 8 ans, lots A#### Sanofi (rappels)
    "33": "Infanrix Quinta",      # 2 ans, lots A69C GSK
    "28": "BCG SSI",              # nourrissons, lots CW/AR SSI
    "41": "Gardasil",             # 9 ans, lots P3H091V Merck (pic août)
    "35": "Revaxis",              # 39 ans, lots DD Sanofi
    "53": "Vaxigrip HS",          # 62 ans, lots R4A423V (autre grippe)
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
