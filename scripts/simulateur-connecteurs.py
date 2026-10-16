#!/usr/bin/env python3
"""Simulateur local des connecteurs santé (Amélie + DICOS) pour Primia.

Imite les réponses des services réels afin de tester les connecteurs
de bout en bout sans habilitation. À utiliser avec .env :
  AMELIE_URL=http://localhost:9997
  AMELIE_IDENTIFIANT=simulateur
  AMELIE_MOT_DE_PASSE=simulateur
  DICOS_BAL_URL=http://localhost:9997/dicos

Usage : python3 scripts/simulateur-connecteurs.py
"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Données factices — remplacez le NIR par celui d'un patient de VOTRE base
# de test pour voir le rattachement automatique fonctionner.
ARRETS = [
    {
        "id": "AT-2024-001",
        "nom": "DUPONT",
        "prenoms": "Marie",
        "nir": "275021212345678",
        "dateDebut": "2024-03-04",
        "dateFin": "2024-03-15",
        "motif": "Lombalgie aiguë",
        "extension": False,
    },
    {
        "id": "AT-2024-002",
        "nom": "MARTIN",
        "prenoms": "Paul",
        "nir": "1751212123456 78",
        "dateDebut": "2024-03-10",
        "dateFin": "2024-03-20",
        "motif": "Grippe saisonnière",
        "extension": False,
    },
]

MESSAGES_DICOS = {
    "messages": [
        {
            "id": "DICOS-001",
            "subject": "Résultats d'analyse — DUPONT Marie",
            "from": "laboratoire@biosud.fr",
            "attachments": [{"nom": "bilan.pdf", "type": "application/pdf"}],
        }
    ]
}

class Handler(BaseHTTPRequestHandler):
    def _json(self, data, code=200):
        corps = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        chemin = self.path.split("?")[0]
        # --- Amélie ---
        if chemin == "/arrets-travail/nonTraites":
            self._json({"arrets": ARRETS})
        elif chemin.startswith("/arrets-travail/AT-"):
            at_id = chemin.split("/")[-1]
            at = next((a for a in ARRETS if a["id"] == at_id), None)
            self._json(at or {}, 200 if at else 404)
        # --- DICOS (BAL) ---
        elif chemin == "/dicos/messages":
            self._json(MESSAGES_DICOS)
        elif "/dicos/messages/" in chemin and "/pieces/0" in chemin:
            # Faux PDF de résultats d'analyse (texte lisible par l'OCR simulé
            # via le pipeline : ici on renvoie un PDF minimal factice).
            contenu = b"%PDF-1.4\n% Resultats laboratoire BioSud\nPatient: DUPONT Marie\nGlycemie: 1.10 g/L\nHbA1c: 6.8 %\nCholesterol total: 2.1 g/L\nTension: 13/8\n"
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(contenu)))
            self.end_headers()
            self.wfile.write(contenu)
        else:
            self._json({"erreur": "route inconnue"}, 404)

    def log_message(self, fmt, *args):
        print(f"[simulateur] {self.path}")

if __name__ == "__main__":
    print("Simulateur connecteurs Primia sur http://localhost:9997")
    print("  Amélie : http://localhost:9997/arrets-travail/nonTraites")
    print("  DICOS  : http://localhost:9997/dicos/messages")
    print("Configurez .env : AMELIE_URL=http://localhost:9997")
    HTTPServer(("127.0.0.1", 9997), Handler).serve_forever()
