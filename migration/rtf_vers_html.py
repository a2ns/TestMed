#!/usr/bin/env python3
"""Convertit les notes/contenus stockés en RTF par MagicMed en HTML,
en préservant le formatage (gras, italique, souligné, listes, puces).

L'IHM Primia affiche ensuite ce HTML comme texte enrichi.

Usage :
  python3 rtf_vers_html.py --dry-run   (aperçu sans modification)
  python3 rtf_vers_html.py             (conversion effective)
"""

import html as html_mod
import re
import subprocess
import sys
import tempfile

DRY_RUN = "--dry-run" in sys.argv

PSQL = ["docker", "exec", "-i", "magicmed-postgres", "psql",
        "-U", "primia", "-d", "primia"]


def psql(sql):
    r = subprocess.run(PSQL + ["-tAc", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout


def rtf_vers_html(rtf):
    """Convertit le sous-ensemble RTF utilisé par MagicMed en HTML minimal."""
    out = []
    i = 0
    n = len(rtf)
    gras = 0
    italique = 0
    souligne = 0
    liste_puce = 0

    def fermer_styles():
        if liste_puce:
            out.append("</li>")
        html_s = ""
        if souligne:
            html_s += "</u>"
        if italique:
            html_s += "</em>"
        if gras:
            html_s += "</strong>"
        out.append(html_s)

    def ouvrir_styles():
        html_s = ""
        if gras:
            html_s += "<strong>"
        if italique:
            html_s += "<em>"
        if souligne:
            html_s += "<u>"
        out.append(html_s)

    # ignorer les groupes de déclaration (fonttbl, colortbl, stylesheet, generator)
    rtf = re.sub(r"\{\\(?:fonttbl|colortbl|stylesheet|generator|\\\\\*[^ ]*)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", "", rtf)
    n = len(rtf)
    while i < n:
        c = rtf[i]
        if c == "{":
            i += 1
        elif c == "}":
            i += 1
        elif c == "\\":
            # \'HH : caractère Latin-1 en hex
            m = re.match(r"\\'([0-9a-fA-F]{2})", rtf[i:])
            if m:
                out.append(html_mod.escape(chr(int(m.group(1), 16))))
                i += len(m.group(0))
                continue
            # \* \ sont ignorés : ignorer le groupe suivant
            if rtf[i + 1:i + 3] in ("\\*",):
                i += 2
                continue
            # caractères échappés
            if rtf[i + 1:i + 2] in ("\\", "{", "}"):
                out.append(html_mod.escape(rtf[i + 1]))
                i += 2
                continue
            # commandes avec argument numérique optionnel
            m = re.match(r"\\([a-zA-Z]+)(-?\d+)? ?", rtf[i:])
            if m:
                cmd, arg = m.group(1), m.group(2)
                arg = int(arg) if arg is not None else None
                if cmd == "b":
                    fermer_styles()
                    gras = 1 if arg != 0 else 0
                    ouvrir_styles()
                elif cmd == "i":
                    fermer_styles()
                    italique = 1 if arg != 0 else 0
                    ouvrir_styles()
                elif cmd == "ul":
                    fermer_styles()
                    souligne = 1 if arg != 0 else 0
                    ouvrir_styles()
                elif cmd in ("pard", "plain"):
                    fermer_styles()
                    gras = italique = souligne = 0
                elif cmd == "par":
                    if liste_puce:
                        out.append("</li><li>")
                    else:
                        out.append("<br>")
                elif cmd == "line":
                    out.append("<br>")
                elif cmd == "tab":
                    out.append("&nbsp;&nbsp;&nbsp;&nbsp;")
                elif cmd == "pntext" or cmd == "pn":
                    pass
                i += len(m.group(0))
                continue
            i += 1
        else:
            out.append(html_mod.escape(c))
            i += 1

    fermer_styles()
    html_txt = "".join(out)
    html_txt = re.sub(r"(<br>){3,}", "<br><br>", html_txt)
    html_txt = re.sub(r"\s+</li><li>", "</li><li>", html_txt)
    return f"<p>{html_txt}</p>"


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
        # Extraction via \copy CSV : insensible aux newlines/quotes dans le contenu
        like = "%\\\\rtf1%"
        sql_export = (f"\\copy (SELECT id, {col} FROM \\\"{table}\\\" "
                      f"WHERE {col} LIKE '{like}') TO '/tmp/rtf_export.csv' WITH CSV")
        r = subprocess.run(PSQL + ["-c", sql_export], capture_output=True, text=True)
        if r.returncode != 0:
            print(f"ERREUR export {table} :", r.stderr[:300])
            sys.exit(1)
        subprocess.run(["docker", "cp", "magicmed-postgres:/tmp/rtf_export.csv",
                        "/tmp/rtf_export.csv"], check=True, capture_output=True)

        import csv as csv_mod
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
            print(f"{table} : rien à convertir")
            continue

        # Ré-injection via CSV + UPDATE FROM (échappement géré par le format CSV)
        with open("/tmp/rtf_updates.csv", "w", encoding="utf-8") as fh:
            w = csv_mod.writer(fh)
            w.writerows(updates)
        subprocess.run(["docker", "cp", "/tmp/rtf_updates.csv",
                        "magicmed-postgres:/tmp/rtf_updates.csv"],
                       check=True, capture_output=True)
        req = (f"CREATE TEMP TABLE maj_rtf (id TEXT, contenu TEXT); "
               f"\\copy maj_rtf FROM '/tmp/rtf_updates.csv' WITH CSV; "
               f"UPDATE \\\"{table}\\\" t SET \\\"{col}\\\" = m.contenu "
               f"FROM maj_rtf m WHERE t.id = m.id;")
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-c", req],
                          capture_output=True, text=True)
        if r.returncode != 0:
            print(f"ERREUR psql sur {table} :", r.stderr[:300])
            sys.exit(1)
        print(f"{table} : {len(updates)} enregistrements convertis (RTF -> HTML)")

    print("\nAperçu d'une note convertie :")
    print(psql("SELECT LEFT(notes, 300) FROM \"Consultation\" "
               "WHERE notes LIKE '<p>%' ORDER BY date DESC LIMIT 1"))


if __name__ == "__main__":
    main()
