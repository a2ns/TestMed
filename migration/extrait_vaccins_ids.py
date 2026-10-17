#!/usr/bin/env python3
"""Extrait la table VACCINS avec les IDs : parse les octets autour de chaque nom.

Hypothèse structure : chaque ligne de la table contient l'ID (INTEGER little-endian
4 octets, ou SHORT 2 octets) à une position fixe avant le nom. On affiche pour
chaque nom les octets qui le précèdent pour identifier le motif ID.
"""

import os
import re

MIG = os.path.dirname(os.path.abspath(__file__))
ITB = None
for f in sorted(os.listdir(os.path.join(MIG, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        ITB = f
        break
chemin = os.path.join(MIG, "data", ITB)

ZONE_DEBUT = 3_100_000
ZONE_FIN = 3_200_000  # la table VACCINS est au début de la zone (noms courts)

with open(chemin, "rb") as f:
    f.seek(ZONE_DEBUT)
    data = f.read(ZONE_FIN - ZONE_DEBUT)

print(f"Zone : {len(data)} octets ({ZONE_DEBUT}-{ZONE_FIN})")

# tous les textes imprimables avec leurs offsets
occurrences = []
for m in re.finditer(rb"[A-Za-z\x80-\xff][A-Za-z0-9\x80-\xff'(),%&\-\. /]{5,}", data):
    mot = m.group().decode("utf-8", errors="replace").strip()
    if len(mot) >= 6:
        occurrences.append((ZONE_DEBUT + m.start(), mot))

# ne garder que les vaccins (avant l'arrivée des médicaments)
VAC_MOTS = ("BCG", "grippe", "GRIPPE", "Vaxigrip", "VAXIGRIP", "Prevenar",
            "PREVENAR", "prevenar", "Revaxis", "REVAXIS", "Infanrix", "INFANRIX",
            "Pneumo", "PNEUMO", "RotaTeq", "RotaTeq".lower(), "Gardasil", "GARDASIL",
            "Coqueluche", "Oreillons", "Poliomy", "Papillom", "Zostavax", "ZOSTAVAX",
            "Fluarix", "FLUARIX", "Avaxim", "AVAXIM", "Bexsero", "BEXSERO",
            "M-M-RVaxPro", "Pentavac", "PENTAVAC", "Hexyon", "HEXYON",
            "Imovax", "IMOVAX", "Hexa", "Quinta", "Tetra", "tétanique",
            "rabique", "rotavirus", "HPV", "tuberculose", "Méningo")
vaccins = [(off, mot) for off, mot in occurrences
           if any(v in mot for v in VAC_MOTS)]

print(f"\n=== {len(vaccins)} occurrences de vaccins avec offsets ===")
for off, mot in vaccins:
    # les 16 octets précédents (recherche du champ ID)
    with open(chemin, "rb") as f:
        f.seek(off - 16)
        avant = f.read(16)
    # hypothèses ID : 4 octets LE à -4, -8, ou 2 octets
    import struct
    id4a = struct.unpack("<i", avant[-4:])[0]
    id4b = struct.unpack("<i", avant[-8:-4])[0]
    id2 = struct.unpack("<h", avant[-2:])[0]
    print(f"  @{off} | ID@-4={id4a} ID@-8={id4b} ID@-2={id2} | {mot[:60]}")
