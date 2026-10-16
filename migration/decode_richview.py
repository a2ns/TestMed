#!/usr/bin/env python3
"""Décode les BLOB CONSULTATION de MagicMed (format RichView Delphi) en HTML.

Structure observée :
- marqueurs de sections : lignes commençant par '-<chiffre>' (-8 1 3 1, -9 2 0...)
- bloc RVStyle : feuille de style (StyleName, FontName, Color...) à ignorer
- texte : chaque caractère suivi d'un octet de padding (0x2E observé, variantes
  possibles 0x00/0x20 selon versions) ; séparateurs \\r entre éléments

Le décodeur :
1. lit le BLOB en octets bruts
2. ignore les lignes marqueurs et la feuille de style
3. reconstruit le texte en éliminant l'octet de padding sur les paires
4. produit du HTML minimal (paragraphes, gras si fsBold détecté par style — v1 : texte simple)
"""

import re


def decode_richview(raw: bytes) -> str:
    """Décode un BLOB RichView MagicMed en texte (puis HTML)."""
    if raw is None:
        return ""

    # Le contenu peut être un texte déjà lisible (RTF, texte brut) : cas simple
    try:
        debut = raw[:6].decode("ascii", errors="ignore")
        if debut.startswith("{\\rtf"):
            return raw.decode("cp1252", errors="replace")
    except Exception:
        pass

    # Format RichView : décoder octet par octet.
    # Les paires (caractère, padding 0x2E) forment le texte ; les marqueurs sont
    # des séquences d'octets ASCII sans padding. Heuristique : un octet est du
    # padding si, sur une fenêtre, il vaut 0x2E/0x00/0x20 et précède un imprimable.
    #
    # Approche validée sur les spécimens : supprimer les octets de padding
    # parmi {0x2E, 0x00} lorsqu'ils alternent avec des caractères imprimables,
    # puis interpréter le reste comme ASCII/cp1252.
    # Le texte est encodé en paires : (caractère, padding). Le padding est
    # majoritairement 0x2E mais varie. Stratégie : sur les paires, garder
    # l'octet de rang pair (index 0, 2, 4...) quand la structure est régulière.
    # Détection d'alignement : essayer les deux phases et garder celle qui
    # produit le plus de caractères imprimables ASCII.
    def extraire(phase):
        res = []
        for i in range(phase, len(raw) - 1, 2):
            res.append(raw[i])
        return bytes(res)

    def score(b):
        imprimables = sum(1 for x in b if 32 <= x < 127 or x in (10, 13))
        return imprimables / max(len(b), 1)

    cands = []
    for phase in (0, 1):
        b = extraire(phase)
        cands.append((score(b), b))
    meilleur = max(cands, key=lambda c: c[0])
    texte = meilleur[1].decode("cp1252", errors="replace")

    # Nettoyage : lignes marqueurs (-8 1 3 1, -9 2 0...) et blocs de style
    lignes = []
    for ln in texte.split("\r"):
        ln = ln.strip("\x00.\x1f")
        if not ln:
            continue
        # ligne de marqueurs : que chiffres/espaces/tirets courts
        if re.match(r"^[-\d ]+$", ln):
            continue
        # blocs style (RVStyle, StyleName, FontName...) : ignorer jusqu'à fin de style
        if any(m in ln for m in ("RVStyle", "StyleName", "FontName", "Color",
                                  "fsBold", "VShift", "Size", "Unicode",
                                  "RVCleanBookMark", "RVData", "Style")):
            continue
        lignes.append(ln)

    return "\n".join(lignes).strip()


def vers_html(texte: str) -> str:
    """Enveloppe le texte décodé en HTML minimal pour l'IHM Primia."""
    if not texte:
        return ""
    paragraphs = [p.replace("\n", "<br>") for p in texte.split("\n\n")]
    return "".join(f"<p>{p}</p>" for p in paragraphs if p)
