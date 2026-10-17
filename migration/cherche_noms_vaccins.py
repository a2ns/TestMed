#!/usr/bin/env python3
"""Cherche les noms de vaccins DANS le fichier de base (lecture octets directs).

Le verrou : Firebird valide la collation ICU à chaque accès à VACCINS.NOM.
La parade : lire le fichier de données directement et chercher les textes.
Les noms de vaccins français contiennent des mots reconnaissables (GRIPPE,
TETANOS, PNEUMO, ROR, INFANRIX, BCG...) encodés en UTF8 ou UTF16.
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
if not ITB:
    print("ERREUR : aucune base -sysdbb.itb")
    sys.exit(1)
chemin = os.path.join(MIG, "data", ITB)
taille = os.path.getsize(chemin)
print(f"Fichier : {ITB} ({taille/1e9:.2f} Go) — scan des textes vaccins...")

# signatures en UTF8 et UTF16LE des marqueurs de vaccins
MOTS = ["GRIPPE", "TETANOS", "TETAN", "PNEUMO", "ROR", "INFANRIX",
        "BCG", "ROTAVIRUS", "ZOSTAVAX", "HPV", "REVAXIS", "HEPATITE",
        "MENING", "GARDASIL", "PREVENAR", "DT-POLIO", "PENTAVAC",
        "VAXIGRIP", "FLUARIX", "M-M-RVAXPRO", "BCG SSI", "IMOVAX"]

trouves = {}
CHUNK = 32 * 1024 * 1024
overlap = 256
prev = b""
offset = 0
with open(chemin, "rb") as f:
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = prev + chunk
        base = offset - len(prev)
        for mot in MOTS:
            for enc, nom_enc in ((mot.encode("utf-8"), "utf8"),
                                 (mot.encode("utf-16-le"), "utf16")):
                start = 0
                while True:
                    i = data.find(enc, start)
                    if i == -1:
                        break
                    # contexte : texte lisible autour
                    ctx_deb = max(0, i - 60)
                    ctx = data[ctx_deb:i + 100]
                    # extraire les caractères imprimables
                    try:
                        if nom_enc == "utf16":
                            texte = ctx.decode("utf-16-le", errors="ignore")
                        else:
                            texte = ctx.decode("utf-8", errors="ignore")
                    except Exception:
                        texte = ""
                    texte = "".join(c if c.isprintable() or c == " " else "·" for c in texte)
                    cle = f"{nom_enc}:{mot}"
                    if cle not in trouves:
                        trouves[cle] = (base + ctx_deb, texte[:160])
                    start = i + 1
        prev = data[-overlap:]
        offset += len(chunk)
        if offset % (256 * 1024 * 1024) == 0:
            print(f"  ... {offset/1e9:.1f} Go scannés")

print(f"\n=== {len(trouves)} marqueurs trouvés ===")
for cle, (off, ctx) in sorted(trouves.items()):
    print(f"\n[{cle}] @ {off}")
    print(f"  {ctx}")
