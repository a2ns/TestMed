# MagicMed — Refonte (client lourd Tauri)

Refonte moderne de **MagicMed / MagicGed** : client lourd multiplateforme (Windows/macOS)
pour cabinet médical, avec GED, scan de masse + OCR, impression, Sesam-Vitale (Windows)
et **assistant IA d'aide à la rédaction de courriers médicaux**.

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
┌── Client lourd (Tauri v2 : Rust + React) ──┐
│  IHM React/Tailwind                        │
│  Core Rust :                                │
│   - Sesam-Vitale (CPS + carte Vitale, FSV)  │
│   - Scan de masse + OCR Tesseract           │
│   - Impression (courriers, étiquettes)      │
│   - Cache local / fichiers documents        │
└───────────────┬─────────────────────────────┘
                │ HTTPS / TCP (réseau cabinet)
        PostgreSQL (serveur central)
                │
        Module IA (Mistral API ou Ollama local)
```

## Structure du monorepo

```
apps/desktop/        client Tauri (src-tauri Rust + IHM React)
packages/db/         schéma Prisma + migrations (PostgreSQL)
docs/               architecture, conformité, guide de déploiement
```

## Documentation

- [Architecture](docs/architecture.md) — composants, flux, sécurité
- [Exigences & conformité](docs/exigences-conformite.md) — couverture réglementaire
- [Guide de déploiement](docs/deploiement.md) — installation poste par poste

## Démarrage rapide (développement)

```bash
# Base de données
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=magicmed postgres:16
cd packages/db && npm install && npx prisma db push

# Client lourd
cd apps/desktop
npm install
npm run tauri dev
```

## Modules fonctionnels

- **Patients** : fiches complètes, historique, identité Vitale.
- **GED (MagicGed)** : scan de masse, OCR automatique, classement par
  patient/type, recherche plein texte (tsvector), versions.
- **Courriers** : rédaction assistée par IA (génération, reformulation,
  relecture), gabarits, impression.
- **Sesam-Vitale** : lecture carte Vitale + CPS, facturation (phase 2,
  nécessite le contrat GIE et FSV — Windows).
- **Paramètres / utilisateurs** : rôles médecin / secrétaire / admin.

## Démarrage (développement)

```bash
# Base de données
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=magicmed postgres:16
cd packages/db && npm install && npx prisma migrate dev

# Client lourd
cd apps/desktop
npm install
npm run tauri dev
```

## Conformité

Données de santé : RGPD, chiffrement au repos recommandé, hébergement HDS
si cloud. L'OCR et l'IA locale (Ollama) permettent de garder les données
dans le cabinet.
