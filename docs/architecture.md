# Architecture — MagicMed v2

## 1. Vue d'ensemble

Client lourd multiplateforme (Windows/macOS) connecté à un PostgreSQL central
dans le cabinet. Le poste de facturation (Windows) embarque FSV pour
Sesam-Vitale ; les autres postes (macOS/Windows) couvrent GED, courriers,
consultation.

## 2. Composants

| Composant | Rôle | Technologie |
|---|---|---|
| Client lourd | IHM + intégrations matérielles | Tauri v2 (Rust), React/TS/Tailwind |
| Module Sesam-Vitale | CPS, carte Vitale, lots | FFI Rust → sgpv.dll (FSV) |
| Module scan/OCR | scan masse, indexation GED | TWAIN/SANE + Tesseract |
| Module impression | courriers, ordonnances | printpdf / APIs système |
| Module IA | génération de courriers | Mistral API ou Ollama (abstraction) |
| BDD | données + GED + plein texte | PostgreSQL 16 (tsvector) |

## 3. Schéma de données (extrait)

- `praticien` : médecins, CPS, RPPS
- `patient` : identité, NIR (chiffré), carte Vitale (B2)
- `document` : GED — fichier, type, OCR texte, version, classification
- `courrier` : contenu, gabarit, statut, version IA
- `consultation` : historique des passages
- `audit_log` : traçabilité accès données de santé

## 4. Flux clés

### Scan de masse → GED (implémenté)
1. `scan_masse` (core Rust) : scan ADF via SANE (`scanimage --batch`) ou TWAIN (Windows).
2. OCR Tesseract local (pack `fra`) sur chaque page + confiance moyenne.
3. Assemblage PDF unique (`img2pdf`) stocké dans le dossier GED.
4. Insertion en base avec `to_tsvector('french', …)` → recherche plein texte.
5. Nettoyage du dossier temporaire.

Prérequis postes : `sane-backends` (macOS : `brew install sane-backends`),
`tesseract-ocr` + pack `fra`. TWAIN Windows : FFI SDK constructeur (phase pilote).

### Rédaction assistée d'un courrier
1. Le praticien sélectionne le patient + gabarit (adressage, compte rendu…).
2. Notes de consultation + contexte patient → prompt IA.
3. L'IA produit un brouillon ; relecture/reformulation itérative.
4. Validation par le médecin, impression et archivage GED.

### Sesam-Vitale (phase 2)
1. Contrat GIE SESAM-Vitale + lecteur certifié + FSV installé.
2. FFI Rust vers sgpv.dll : lecture CPS, lecture carte Vitale, FSE/FSV.
3. Pré-requis : poste Windows uniquement.

### Impression des courriers (implémenté)
1. `imprimer_courrier` : génère un PDF mis en page (en-tête praticien,
   destinataire, objet, corps, signature) via `genpdf`.
2. Impression système : `lpr`/CUPS (macOS), `ShellExecuteW` "print" (Windows).
3. Archivage optionnel du PDF dans la GED.

### Authentification (implémenté)
- Comptes `praticien` (identifiant + mot de passe bcrypt, `npm run seed`
  dans `packages/db` crée le compte `admin` initial).
- Session en mémoire du client (token, expiration 8 h), rôles
  MEDECIN / SECRETAIRE / ADMIN ; création de comptes réservée à ADMIN.
- IHM : écran de connexion, garde d'accès (toutes les vues exigent une
  session), nom + rôle affichés en bas de la barre latérale.

## 5. Sécurité / RGPD

- Authentification par utilisateur (rôles : médecin, secrétaire, admin).
- Chiffrement sensible au repos (NIR, données de santé).
- Journal d'audit des accès.
- IA : option locale (Ollama) pour ne rien exfiltrer ; sinon API avec
  anonymisation du contexte envoyé.
- Sauvegarde BDD chiffrée.

## 6. Roadmap

1. **Phase 1** : socle (Tauri, BDD, Patients, GED, courriers + IA, impression)
2. **Phase 2** : Sesam-Vitale, scan masse + OCR en production
3. **Phase 3** : facturation complète, téléservices (DMP)
