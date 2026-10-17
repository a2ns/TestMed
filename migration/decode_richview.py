#!/usr/bin/env python3
"""Décode les BLOB CONSULTATION de MagicMed (format RichView Delphi) en texte.

Structure observée (vérifiée sur spécimens réels) :
- marqueurs de sections : lignes ASCII « -8 1 3 1 », « -9 2 0 0 2 0 1 »...
- bloc RVStyle : feuille de style ASCII brute (StyleName, FontName, Color...)
- texte du document : paires (caractère, padding 0x2E), segments séparés par \\r
"""

import re


def _extraire_paires(b):
    """Décode un segment en paires (caractère, padding). Alignement auto."""
    def essai(phase):
        res = bytes(b[i] for i in range(phase, len(b) - 1, 2))
        ok = sum(1 for x in res if 32 <= x < 127 or x in (10, 13))
        return ok / max(len(res), 1), res
    cands = [essai(0), essai(1)]
    return max(cands, key=lambda c: c[0])[1]


def decode_richview(raw):
    """Décode un BLOB RichView MagicMed en texte."""
    if raw is None:
        return ""

    # BLOB déjà en texte lisible (RTF ou texte brut) : cas simple
    debut = raw[:6].decode("ascii", errors="ignore")
    if debut.startswith("{\\rtf"):
        return raw.decode("cp1252", errors="replace")

    brut_ascii = raw.decode("cp1252", errors="replace")

    # fin du bloc style : dernier mot-clé de style dans la première moitié
    zone = brut_ascii[:max(200, len(brut_ascii) // 2)]
    fins = []
    for mot in ("Color", "Unicode", "Size", "Style"):
        idx = zone.rfind(mot)
        if idx != -1:
            fins.append(idx + len(mot))
    if fins:
        fin_style = max(fins)
        tete = brut_ascii[:fin_style]
        corps = raw[fin_style:]
    else:
        tete = ""
        corps = raw

    # découpage du corps en segments sur \r ; chaque segment est évalué :
    # marqueur (chiffres) -> brut ; majoritairement paddé -> paires ; sinon brut
    segments = []
    for part in re.split(b"\r", corps):
        if not part:
            continue
        try:
            t = part.decode("ascii")
            if re.match(r"^[-\d ]+$", t.strip()):
                segments.append(part)
                continue
        except (UnicodeDecodeError, ValueError):
            pass
        n = len(part)
        if n >= 4:
            impairs = sum(1 for i in range(1, n, 2) if part[i] == 0x2E)
            if impairs / max(n // 2, 1) > 0.5:
                segments.append(_extraire_paires(part))
                continue
        segments.append(part)

    texte = tete + "\r" + "\r".join(
        seg.decode("cp1252", errors="replace") for seg in segments
    )
    # fin de segment paire : un dernier caractère peut être perdu si le
    # padding final manque ; rien à faire ici (perte max 1 char/segment).

    # nettoyage : marqueurs et lignes de style
    lignes = []
    for ln in texte.split("\r"):
        ln = ln.strip("\x00.\x1f")
        if not ln:
            continue
        if re.match(r"^[-\d ]+$", ln):
            continue
        if any(m in ln for m in ("RVStyle", "StyleName", "FontName", "Color",
                                  "fsBold", "VShift", "Size", "Unicode",
                                  "RVCleanBookMark", "RVData")):
            continue
        if re.match(r"^!?\.+\t?", ln) or re.match(r"^cl[A-Z]", ln):
            continue
        # artefacts de feuille de style décodée en paires : "Style", "Name",
        # "Text", "Bold", "Size", "Font", "Arial", "Color", "Black", "VShift"...
        if re.match(r"^(Style|Name|Text|Bold|Size|Font|Arial|Color|Black|Blue|Navy|VShift|Double|Normal|Heading|Subheading|Unicode|fsBold)$", ln.strip()):
            continue
        # NB : les artefacts HelloDoc/*VID* sont poncés IN-PLACE plus bas,
        # pas filtrés ici (des phrases légitimes mentionnent HelloDoc)
        # lignes à dominante de paramètres numériques (marqueurs résiduels) :
        # ex. "-6 1 -1 0 0 "80515" 0 18" — chiffres/espaces/quotes uniquement,
        # trop de chiffres pour du texte clinique
        lettres = sum(1 for c in ln if c.isalpha())
        chiffres = sum(1 for c in ln if c.isdigit())
        if len(ln) > 5 and lettres < 3 and chiffres > len(ln) * 0.3:
            continue
        lignes.append(ln)

    # Ponçage in-place des artefacts embarqués DANS les lignes de texte :
    # - "HelloDoc:)01-" (objet OLE de messagerie) et ses variantes
    # - "*VID*", "*IMG*" (clips/images embarqués)
    # - "RVSCleanBookMark"/"RVCleanBookMark" (signets RichView)
    # - blocs de paramètres ".) -6 1 -1 0 0 \"80515\" 0 18" en fin/milieu de ligne
    texte_final = "\n".join(lignes)
    texte_final = re.sub(r"HelloDoc:?\)?[0-9-]*", "", texte_final)
    texte_final = re.sub(r"\*VID\*|\*IMG\*", "", texte_final)
    texte_final = re.sub(r"RVS?CleanBookMark", "", texte_final)
    # blocs de paramètres ".) -6 1 -1 0 0 \"80515\" 0 18" : motif strict —
    # ligne commençant par .) puis uniquement chiffres/espaces/tirets/quotes
    texte_final = re.sub(
        r"(?m)^\.?\)\s?-\d[\d\s\-\"']+$", "", texte_final)
    # lignes devenues vides après ponçage
    texte_final = "\n".join(
        ln for ln in texte_final.split("\n") if ln.strip()
    )
    return texte_final.strip()


def vers_html(texte):
    """Enveloppe le texte décodé en HTML minimal pour l'IHM Primia."""
    if not texte:
        return ""
    paragraphs = [p.replace("\n", "<br>") for p in texte.split("\n\n")]
    return "".join(f"<p>{p}</p>" for p in paragraphs if p)
