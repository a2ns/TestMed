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
            data = psql(f"SELECT LEFT({col}, 3000) FROM \"{table}\" "
                        f"WHERE {col} LIKE '%\\\\rtf1%' LIMIT 2")
            for rtf in data.split("\x01")[:2]:
                rtf = rtf.strip()
                if rtf:
                    print(f"\n[{table}] RTF : {rtf[:80]}...")
                    print(f"  => HTML : {rtf_vers_html(rtf)[:400]}")
        return

    for table, col in [("Consultation", "notes"), ("Courrier", "contenu")]:
        data = psql(f"SELECT id || E'\x01' || replace(replace({col}, chr(10), E'\\\\n'), chr(13), '') "
                      f"FROM \"{table}\" WHERE {col} LIKE '%\\\\rtf1%'")
        updates = []
        for line in data.splitlines():
            if "\x01" not in line:
                continue
            cid, rtf = line.split("\x01", 1)
            rtf = rtf.replace("\\n", "\n")
            html_txt = rtf_vers_html(rtf)
            if html_txt.strip() not in ("", "<p></p>", "<p><br></p>"):
                updates.append((cid, html_txt))
        if not updates:
            print(f"{table} : rien à convertir")
            continue

        with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False,
                                         encoding="utf-8") as f:
            for cid, texte in updates:
                safe = texte.replace("'", "''")
                f.write(f"UPDATE \"{table}\" SET \"{col}\" = '{safe}' "
                        f"WHERE id = '{cid}';\n")
            path = f.name
        subprocess.run(["docker", "cp", path, "magicmed-postgres:/tmp/rtf.sql"],
                       check=True, capture_output=True)
        r = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-f", "/tmp/rtf.sql"],
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
