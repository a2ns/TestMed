#!/usr/bin/env python3
"""Convertit les notes/contenus stockés en RTF par MagicMed en HTML.

Usage :
  python3 rtf_vers_html.py --dry-run   (aperçu sans modification)
  python3 rtf_vers_html.py             (conversion effective)
"""

import html as html_mod
import re
import subprocess
import sys

DRY_RUN = "--dry-run" in sys.argv

PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


CONTROLES = {
    "par": "\n", "line": "\n", "page": "\n\n", "tab": "\t",
    "emdash": "—", "endash": "–",
    "lquote": "‘", "rquote": "’", "ldblquote": "«", "rdblquote": "»",
    "bullet": "•",
}


def rtf_vers_html(rtf):
    """Convertit le sous-ensemble RTF utilisé par MagicMed en HTML minimal."""
    # supprimer les groupes de déclaration (fonttbl, colortbl, ...) avec leurs
    # sous-groupes imbriqués, jusqu'à l'accolade fermante appariée
    def supprimer_groupes(texte, mot_cle):
        resultat = texte
        cle = "\\" + mot_cle
        while True:
            idx = resultat.find("{" + cle)
            if idx == -1:
                break
            # trouver l'accolade fermante appariée
            profondeur = 0
            fin = idx
            for j in range(idx, len(resultat)):
                if resultat[j] == "{":
                    profondeur += 1
                elif resultat[j] == "}":
                    profondeur -= 1
                    if profondeur == 0:
                        fin = j
                        break
            resultat = resultat[:idx] + resultat[fin + 1:]
        return resultat

    for mot_cle in ("fonttbl", "colortbl", "stylesheet", "generator"):
        rtf = supprimer_groupes(rtf, mot_cle)
    out = []
    i = 0
    n = len(rtf)
    gras = italique = souligne = 0

    def ecrire_styles():
        if souligne:
            out.append("</u>")
        if italique:
            out.append("</em>")
        if gras:
            out.append("</strong>")

    while i < n:
        c = rtf[i]
        if c in "{}":
            i += 1
        elif c == "\\":
            m = re.match(r"\\'([0-9a-fA-F]{2})", rtf[i:])
            if m:
                out.append(html_mod.escape(chr(int(m.group(1), 16))))
                i += len(m.group(0))
                continue
            if rtf[i + 1:i + 2] in ("\\", "{", "}"):
                out.append(html_mod.escape(rtf[i + 1]))
                i += 2
                continue
            m = re.match(r"\\([a-zA-Z]+)(-?\d+)? ?", rtf[i:])
            if m:
                cmd, arg = m.group(1), m.group(2)
                arg = int(arg) if arg is not None else None
                if cmd == "b":
                    ecrire_styles()
                    gras = 1 if arg != 0 else 0
                    if gras:
                        out.append("<strong>")
                elif cmd == "i":
                    ecrire_styles()
                    italique = 1 if arg != 0 else 0
                    if italique:
                        out.append("<em>")
                elif cmd == "ul":
                    ecrire_styles()
                    souligne = 1 if arg != 0 else 0
                    if souligne:
                        out.append("<u>")
                elif cmd in ("pard", "plain"):
                    ecrire_styles()
                    gras = italique = souligne = 0
                elif cmd == "par":
                    out.append("<br>")
                elif cmd == "line":
                    out.append("<br>")
                elif cmd == "tab":
                    out.append("&nbsp;&nbsp;&nbsp;&nbsp;")
                i += len(m.group(0))
                continue
            i += 1
        else:
            out.append(html_mod.escape(c))
            i += 1

    ecrire_styles()
    html_txt = "".join(out)
    html_txt = re.sub(r"(<br>\s*){3,}", "<br><br>", html_txt)
    return "<p>" + html_txt.strip() + "</p>"


def main():
    nb_cons = psql("SELECT COUNT(*) FROM \"Consultation\" WHERE notes LIKE '%\\\\rtf1%'").strip()
    nb_cou = psql("SELECT COUNT(*) FROM \"Courrier\" WHERE contenu LIKE '%\\\\rtf1%'").strip()
    print(f"Consultations avec notes RTF : {nb_cons}")
    print(f"Courriers avec contenu RTF   : {nb_cou}")
    if nb_cons == "0" and nb_cou == "0":
        print("Rien à faire (déjà convertis ?).")
        return

    if DRY_RUN:
        print("\n--- Aperçu de 2 conversions par table (aucune modification) ---")
        for table, col in [("Consultation", "notes"), ("Courrier", "contenu")]:
            data = psql(f"SELECT LEFT({col}, 3000) FROM \"{table}\" "
                        f"WHERE {col} LIKE '%\\\\rtf1%' LIMIT 2")
            for rtf in data.splitlines()[:2]:
                rtf = rtf.strip()
                if rtf:
                    print(f"\n[{table}] RTF : {rtf[:80]}...")
                    print(f"  => HTML : {rtf_vers_html(rtf)[:400]}")
        return

    import csv as csv_mod
    for table, col in [("Consultation", "notes"), ("Courrier", "contenu")]:
        # export direct vers STDOUT redirige dans un fichier local :
        # pas de fichier intermediaire conteneur, pas de docker cp
        sql_export = (
            "\\copy (SELECT id, " + col + ' FROM "' + table + '" '
            "WHERE " + col + " LIKE '%\\\\rtf1%') "
            "TO STDOUT WITH CSV"
        )
        with open("/tmp/rtf_export.csv", "w", encoding="utf-8") as fh_out:
            r = subprocess.run(PSQL + ["-c", sql_export], stdout=fh_out,
                               stderr=subprocess.PIPE, text=True)
        if r.returncode != 0:
            print("ERREUR export", table, ":", (r.stderr or "")[:300])
            sys.exit(1)
        import os as _os
        taille = _os.path.getsize("/tmp/rtf_export.csv")
        print(f"   export {table} : {taille} octets")

        updates = []
        with open("/tmp/rtf_export.csv", encoding="utf-8") as fh:
            for row in csv_mod.reader(fh):
                if len(row) != 2:
                    continue
                cid, rtf = row
                html_txt = rtf_vers_html(rtf)
                if html_txt.strip() not in ("", "<p></p>", "<p><br></p>"):
                    updates.append((cid, html_txt))
        if not updates:
            print(table, ": rien à convertir")
            continue

        # ré-injection : table dédiée (pas TEMP : disparait avec la session),
        # \copy FROM STDIN en streaming (pas de fichier conteneur)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_rtf; "
                               "CREATE TABLE maj_rtf (id TEXT, contenu TEXT);"],
                       check=True, capture_output=True)
        with open("/tmp/rtf_updates.csv", encoding="utf-8") as fh_in:
            r = subprocess.run(PSQL + ["-c",
                                       "\\copy maj_rtf FROM STDIN WITH CSV"],
                               stdin=fh_in, capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR import", table, ":", (r.stderr or "")[:300])
            sys.exit(1)
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c",
                                   'UPDATE "' + table + '" t SET "' + col + '" = m.contenu '
                                   "FROM maj_rtf m WHERE t.id = m.id;"],
                          capture_output=True, text=True)
        if r.returncode != 0:
            print("ERREUR psql sur", table, ":", r.stderr[:300])
            sys.exit(1)
        subprocess.run(PSQL + ["-c", "DROP TABLE IF EXISTS maj_rtf;"],
                       capture_output=True)
        print(table, ":", len(updates), "enregistrements convertis (RTF -> HTML)")

    print("\nAperçu d'une note convertie :")
    print(psql("SELECT LEFT(notes, 300) FROM \"Consultation\" "
               "WHERE notes LIKE '<p>%' ORDER BY date DESC LIMIT 1"))


if __name__ == "__main__":
    main()
