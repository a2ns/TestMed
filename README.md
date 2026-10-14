# Primeia

**Primeia** : client lourd multiplateforme (Windows/macOS) pour cabinet médical,
avec GED, scan de masse + OCR, impression, Sesam-Vitale (Windows) et
**assistant IA d'aide à la rédaction de courriers médicaux**.

> Refonte moderne sur technologies actuelles du logiciel de cabinet historique,
> avec une IHM au goût du jour.

## Stack

| Domaine | Technologie |
|---|---|
| Client lourd | Tauri v2 (Rust) — Windows + macOS |
| IHM | React 18 + TypeScript + Tailwind CSS (Vite) |
| Base de données | PostgreSQL (serveur cabinet, multi-utilisateur) |
| ORM (gestion) | Prisma |
| Accès BDD côté Rust | sqlx |
| OCR | Tesseract (local, embarqué) |
| Scan | TWAIN (Windows) / SANE (macOS via TWAIN bridge) |
| Sesam-Vitale | FSV (sgpv.dll via FFI) — poste Windows uniquement |
| IA | API Mistral (configurable) ou Ollama local |

## Architecture

```
┌── Client lourd (Tauri v2 : Rust + React) ─┐
│  IHM React/Tailwind                        │
│  Core Rust :                                │
│   - Sesam-Vitale (CPS + carte Vitale, FSV)  │
│   - Scan de masse + OCR Tesseract           │
│   - Impression (courriers, étiquettes)      │
│   - Cache local / fichiers documents        │
└─────────────────────────────────────────────┘
                │ HTTPS / TCP (réseau cabinet)
        PostgreSQL (serveur central)
                │
        Module IA (Mistral API ou Ollama local)
```

## Structure du monorepo

```
apps/desktop/        client Tauri (src-tauri Rust + IHM React)
packages/db/         schéma Prisma + migrations (PostgreSQL)
docs/                cahier des charges + architecture
```

## Modules fonctionnels

- **Patients** : fiches complètes, historique, identité Vitale, création.
- **GED** : import avec stockage centralisé, scan de masse, OCR automatique,
  classement par patient/type, recherche plein texte (tsvector), versions.
- **Courriers** : rédaction assistée par IA (génération avec contexte patient,
  reformulation par instruction, relecture), gabarits, impression, validation.
- **Sesam-Vitale** : lecture carte Vitale + CPS, facturation (phase 2,
  nécessite le contrat GIE et FSV — Windows).
- **Paramètres / utilisateurs** : rôles médecin / secrétaire / admin.
- **Tableau de bord** : statistiques du cabinet (patients, documents, courriers).

## Démarrage (développement)

```bash
# Base de données
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=primeia postgres:16
cd packages/db && npm install && npx prisma migrate dev

# Client lourd
cd apps/desktop
npm install
npm run tauri dev
```

Variables d'environnement (voir `.env.example`) : `DATABASE_URL`,
`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `MAGICMED_DOCS_DIR` (stockage documents).

## Conformité

Données de santé : RGPD, chiffrement au repos recommandé, hébergement HDS
si cloud. L'OCR et l'IA locale (Ollama) permettent de garder les données
dans le cabinet.
