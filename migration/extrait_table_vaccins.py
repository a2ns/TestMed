#!/usr/bin/env python3
"""Extrait la table VACCINS depuis le fichier (zone 3-4,5 Mo identifiée par scan).

Structure observée : noms UTF8 séparés par des padding de points (0xB7 décodé '·'),
probablement format : [ID][flags][...nom UTF8...]. On extrait tous les textes
lisibles de la zone et on les associe aux IDs par ordre d'apparition.
"""

import os
import re
import sys

MIG = os.path.dirname(os.path.abspath(__file__))
ITB = None
for f in sorted(os.listdir(os.path.join(MIG, "data"))):
    if f.lower().endswith("-sysdbb.itb"):
        ITB = f
        break
chemin = os.path.join(MIG, "data", ITB)

# zone identifiée par le scan : les noms de vaccins vivent vers 3,1-4,2 Mo
ZONE_DEBUT = 3_100_000
ZONE_FIN = 4_300_000

with open(chemin, "rb") as f:
    f.seek(ZONE_DEBUT)
    data = f.read(ZONE_FIN - ZONE_DEBUT)

print(f"Zone lue : {len(data)} octets")

# extraire les séquences de texte imprimable UTF8 (lettres/chiffres/espaces/parens)
textes = re.findall(
    rb"[A-Za-z0-9\x80-\xff'(),%&\-\./ ]{6,}",
    data)

# filtrer : les noms de vaccins ont du sens médical, les bruits sont des fragments
CANDIDATS = re.compile(
    r"(vaccin|BCG|grippe|GRIPPE|tetan|TETAN|pneumo|PNEUMO|ROR|hepat|HEPAT|"
    r"infanrix|INFANRIX|prevenar|PREVENAR|revaxis|REVAXIS|vaxigrip|VAXIGRIP|"
    r"gardasil|GARDASIL|mening|MENING|zostavax|ZOSTAVAX|rotavirus|ROTAVIRUS|"
    r"rotateq|ROTATEQ|hpv|HPV|coqueluche|Coqueluche|oreillons|Oreillons|"
    r"papillom|Papillom|avaxim|Avaxim|bexsero|Bexsero|imovax|IMOVAX|"
    r"fluarix|FLUARIX|pentavac|PENTAVAC|mmr|M-M|polio|POLIO|hexyon|HEXYON)", re.I)

vus = []
for t in textes:
    try:
        mot = t.decode("utf-8", errors="ignore").strip()
    except Exception:
        continue
    if not mot or len(mot) < 6:
        continue
    if CANDIDATS.search(mot) and mot not in [v[0] for v in vus]:
        vus.append((mot, None))

print(f"\n=== {len(vus)} noms de vaccins détectés dans la zone ===")
for mot in vus:
    print("  ", mot)
