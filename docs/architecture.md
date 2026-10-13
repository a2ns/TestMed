# Architecture — MagicMed v2

## 1. Vue d'ensemble

Client lourd multiplateforme (Windows/macOS) connecté à un PostgreSQL central
dans le cabinet. Le poste de facturation (Windows) embarque FSV pour
Sesam-Vitale ; les autres postes (macOS/Windows) couvrent agenda, patients,
GED, courriers, consultation.

```
┌── Client lourd (Tauri v2 : Rust + React) ────────┐
│  IHM React/TS/Tailwind (pages, routing, garde)   │
│  Core Rust :                                     │
│   auth (bcrypt, sessions, rôles)                 │
│   crypto (AES-256-GCM : NIR, sauvegardes)        │
│   audit (journal des accès)                      │
│   scan (SANE/TWAIN) + ocr (Tesseract)            │
│   ia (courriers : Mistral/Ollama)                │
│   impression (genpdf + CUPS/ShellExecute)        │
│   sauvegarde (pg_dump chiffré, rétention)         │
│   fsv (Sesam-Vitale, Windows) / dmp (fondations) │
└────────────────────┬──────────────────────────────┘
                     │ réseau local cabinet
             PostgreSQL 16 (serveur central)
             (tsvector : recherche plein texte)
```

## 2. Composants

| Composant | Rôle | Technologie |
|---|---|---|
| Client lourd | IHM + intégrations matérielles | Tauri v2 (Rust), React/TS/Tailwind |
| Auth | comptes, sessions 8 h, rôles | bcrypt, tokens en mémoire |
| Crypto | NIR + sauvegardes chiffrés | AES-256-GCM, empreintes SHA-256 |
| Audit | traçabilité des accès | table `audit_log`, écriture non bloquante |
| Scan/OCR | scan masse, indexation GED | TWAIN/SANE + Tesseract (local) |
| Impression | courriers, ordonnances | genpdf + lpr / ShellExecuteW |
| IA | génération de courriers | Mistral API ou Ollama (abstraction) |
| Sauvegarde | archives chiffrées, rétention | pg_dump → gzip → AES-256-GCM |
| FSV | carte Vitale, CPS, FSE | ossature FFI sgpv.dll (Windows, phase 2) |
| DMP | téléservices santé | fondations client (phase 3) |
| BDD | données + GED + plein texte | PostgreSQL 16 (tsvector) |

## 3. Schéma de données

- `praticien` : comptes (identifiant, bcrypt), RPPS, rôles, cabinet
- `patient` : identité, NIR **chiffré** + empreinte, coordonnées, médecin traitant
- `antecedent`, `traitement`, `allergie` : dossier médical par patient
- `consultation` : motif, notes, date
- `rendez_vous` : créneaux, durée, statut (planifié/arrivé/honoré/annulé)
- `ordonnance` + `prescription` : types simple/bi (zones A/B)/sécurisée,
  posologies, renouvellements, substitution
- `document` : GED — fichier, type, OCR texte, `tsvector`, version
- `gabarit_courrier`, `courrier` : gabarits, contenus, statut IA
- `audit_log` : horodatage, utilisateur, action, cible, détail JSON

Migrations : Prisma (`packages/db`, `npm run db:push`), seed du compte admin.

## 4. Flux clés (implémentés)

### Scan de masse → GED
1. `scan_masse` : scan ADF via SANE (`scanimage --batch`) ou TWAIN (Windows).
2. OCR Tesseract local (pack `fra`) page à page + confiance moyenne.
3. Assemblage PDF unique (`img2pdf`) stocké dans le dossier GED.
4. Insertion en base avec `to_tsvector('french', …)` → recherche plein texte.
5. Nettoyage du dossier temporaire ; action journalisée dans l'audit.

### Recherche plein texte
- Termes saisis → conjonction `to_tsquery('french', …)` (opérateurs
  neutralisés), classement `ts_rank`, extraits `ts_headline` surlignés.

### Rédaction assistée d'un courrier
1. Le praticien sélectionne le patient + gabarit (adressage, compte rendu…).
2. Notes de consultation + contexte patient → prompt IA (prompt système
   sécurisé : aucun diagnostic inventé).
3. Brouillon modifiable, impression PDF, archivage GED ; recours journalisé.

### Ordonnance
1. Type simple / bi-ordonnance (zones A/B) / sécurisée.
2. Lignes : médicament, posologie, durée, renouvellements, substitution.
3. Enregistrement transactionnel, impression PDF mise en page, archivage.

### Authentification
- Comptes `praticien` (bcrypt), session 8 h, rôles MEDECIN/SECRETAIRE/ADMIN.
- Commandes sensibles : token de session obligatoire + journalisation.
- Création de comptes réservée à ADMIN.

### Chiffrement du NIR
- AES-256-GCM (AAD lié au domaine) : jamais de NIR en clair en base.
- Empreinte déterministe : unicité/recherche sans déchiffrement.
- Clé maîtresse `MAGICMED_CLE_MASTER` (identique sur tous les postes) ;
  déchiffrement uniquement à l'ouverture de la fiche.

### Sauvegarde chiffrée
- `lancer_sauvegarde` (ADMIN) : pg_dump → gzip → AES-256-GCM.
- Rétention automatique (30 par défaut), restauration par déchiffrement,
  journalisée.

## 5. Sécurité / RGPD

- Authentification nominative + rôles ; échecs de connexion journalisés.
- Chiffrement au repos : NIR, mots de passe, sauvegardes.
- Journal d'audit des accès aux données de santé (consultation ADMIN).
- IA et OCR exécutables 100 % en local (Ollama, Tesseract) : aucune donnée
  exfiltrée si configuré ainsi.
- Architecture on-premise : aucun cloud, pas d'exigence HDS.
- À traiter avant production : rotation de clé (re-chiffrement), TLS si le
  réseau cabinet n'est pas isolé.

## 6. Étapes dépendantes d'acteurs externes

- **Sesam-Vitale** (phase 2) : contrat GIE + FSV + lecteur certifié + CPS →
  branchement FFI sgpv.dll, FSE/télétransmission.
- **DMP/MSSanté** (phase 3) : habilitation du cabinet + certificat logiciel →
  web-services DMP, dépôt CDA.
