# Primia — refonte de MagicMed / MagicGed

Client lourd multiplateforme (Windows + macOS) pour cabinet de médecine
générale, avec GED, scan de masse + OCR, courriers assistés par IA et
conformité données de santé.

> Refonte complète sur technologies actuelles : **Tauri v2 (Rust)**, **React 18
> + TypeScript + Tailwind**, **PostgreSQL**. Architecture 100 % locale au
> cabinet — aucune donnée de santé ne sort du réseau.

## Fonctionnalités

| Module | Détail |
|---|---|
| 🔐 Authentification | Comptes nominatifs (bcrypt), sessions 8 h, rôles médecin / secrétaire / admin |
| 📅 Agenda | Vue journée en créneaux, prise de RDV, statuts (planifié/arrivé/honoré/annulé), détection de conflits |
| 👤 Patients | Fiche complète : identité, NIR **chiffré**, antécédents, traitements, allergies, historique des consultations |
| 📝 Ordonnances | Simple, bi-ordonnance (zones A/B), sécurisée ; renouvellements, substitution, impression PDF |
| ✉️ Courriers | Rédaction **assistée par IA** (génération, reformulation), gabarits, impression, archivage GED |
| 🗂️ GED | Import, **scan de masse ADF** (TWAIN/SANE), **OCR Tesseract local**, recherche plein texte (tsvector français) |
| 🖨️ Impression | PDF mis en page (genpdf) + impression système (CUPS / ShellExecute) |
| 🛡️ Audit | Journal des accès patients, ordonnances, IA, scan, connexions (échecs inclus) — consultation admin |
| 💾 Sauvegarde | pg_dump chiffré AES-256-GCM, rétention automatique, restauration admin |
| ⚙️ Télémédecine (fondations) | Sesam-Vitale FSV (FFI, poste Windows) et DMP — ossatures prêtes, branchement après habilitation |

## Stack

| Domaine | Technologie |
|---|---|
| Client lourd | Tauri v2 (Rust) — Windows + macOS |
| IHM | React 18, TypeScript, Tailwind CSS (Vite) |
| Base de données | PostgreSQL 16 (serveur cabinet, multi-poste) |
| Accès BDD (Rust) | sqlx |
| ORM (gestion/migrations) | Prisma |
| OCR | Tesseract (pack français), 100 % local |
| Scan | SANE (macOS) / TWAIN (Windows) |
| IA | **100 % local par défaut** : Ollama + mistral-nemo — aucune donnée de santé ne quitte le poste |
| Crypto | AES-256-GCM (NIR, sauvegardes), bcrypt (mots de passe) |

## Démarrage rapide (développement)

```bash
# 1. PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=primia postgres:16

# 2. Schéma + compte admin initial
cd packages/db
npm install
DATABASE_URL=postgresql://postgres:primia@localhost:5432/primia npm run db:push
ADMIN_MOT_DE_PASSE=changer-moi npm run seed

# 3. Client lourd
cd ../apps/desktop
npm install
npm run tauri dev
```

Connexion : `admin` / mot de passe du seed (**à changer immédiatement**).

## Configuration

Copier `.env.example` vers `.env` : chaîne PostgreSQL, clé maîtresse
(`MAGICMED_CLE_MASTER`, `openssl rand -base64 32` — identique sur tous les
postes), IA (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`), sauvegarde, FSV, DMP.

## Structure

```
apps/desktop/
  src/              IHM React (pages, components, lib)
  src-tauri/src/     core Rust
    auth/           sessions, rôles, bcrypt
    crypto/         AES-256-GCM (NIR, sauvegardes)
    audit/          journal d'audit
    commands/       commandes Tauri (patients, agenda, ordonnances,
                    courriers, scan, recherche, documents)
    scan/           SANE/TWAIN, assemblage PDF
    ocr/            Tesseract
    ia/             assistant courriers (Mistral/Ollama)
    impression/     PDF genpdf + impression système
    sauvegarde/     pg_dump chiffré, rétention
    fsv/            Sesam-Vitale (ossature FFI, Windows)
    dmp/            DMP (fondations)
packages/db/        schéma Prisma, migrations, seed
docs/               architecture, conformité, déploiement
```

## Documentation

- [Architecture](docs/architecture.md) — composants, flux, modèle de données, sécurité
- [Exigences & conformité](docs/exigences-conformite.md) — couverture des exigences du généraliste et réglementaires
- [Guide de déploiement](docs/deploiement.md) — installation poste par poste, exploitation, dépannage

## Conformité données de santé

- Authentification nominative + rôles, journal d'audit (accès, échecs de connexion)
- Chiffrement au repos du NIR (AES-256-GCM + empreinte déterministe)
- **IA 100 % locale par défaut** (Ollama + mistral-nemo) : aucune donnée de santé ne quitte le poste — choix acté pour la confidentialité médicale
- Sauvegardes chiffrées, rétention automatique
- Hébergement on-premise : aucun cloud requis (HDS non nécessaire)

## Feuille de route

1. **Phase 1 (fait)** : socle complet — agenda, patients, ordonnances,
   courriers IA, GED/OCR, audit, chiffrement, sauvegarde
2. **Phase 2** : Sesam-Vitale (contrat GIE + FSV + CPS, FFI sgpv.dll,
   FSE/teletransmission), base thérapeutique (CSP/CIP)
3. **Phase 3** : DMP/MSSanté (habilitation), sécurisation complète des
   ordonnances stupéfiants

## Licence / statut

Projet de refonte en cours — phase 1 livrée. Voir la documentation de
conformité pour les prérequis réglementaires avant mise en production
(FSV, DMP, clés de chiffrement).
