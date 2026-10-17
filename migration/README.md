# Kit de migration MagicMed/MagicGed → Primia (PostgreSQL)

Ce kit tourne **entièrement sur votre machine (macOS)** via Docker. Aucune donnée
ne quitte votre poste.

## Prérequis

- macOS avec Docker Desktop installé et lancé.
- Vos fichiers de base de données (`.ITB`) — MagicMed et MagicGed s'il y en a deux.

## Installation

1. Copier ce dossier `migration/` où vous voulez (ex. `~/migration-magicmed/`).
2. Créer le sous-dossier `data/` et y placer le(s) fichier(s) `.ITB` :

```bash
cd ~/migration-magicmed
mkdir -p data
cp /chemin/vers/MAGICMED.ITB data/
```

## Étape 1 — Analyse de la base (à faire d'abord)

**Variante A — avec Docker** (si Docker Desktop est installé) :

```bash
chmod +x analyse.sh
./analyse.sh
```

**Variante B — sans Docker Desktop** (Homebrew seul) :

```bash
chmod +x analyse-nodocker.sh
./analyse-nodocker.sh
```

⚠️ **Important** : la formule Homebrew `firebird` est un émulateur de calculatrice
TI, **pas** le SGBD. Le vrai Firebird n'est pas distribué via Homebrew.

- **Option A (recommandée)** : Docker léger sans Docker Desktop via Colima :

```bash
brew install colima docker
colima start          # démarre une mini-VM Docker (~2 Go de RAM, en arrière-plan)
./analyse.sh          # la variante Docker du kit fonctionne alors telle quelle
```

Colima consomme peu et se coupe avec `colima stop` quand vous ne l'utilisez plus.

- **Option B** : installer Firebird officiel pour macOS
  (https://firebirdsql.org/fr/downloads/) puis lancer `./analyse-nodocker.sh`, qui
  détecte l'installation automatiquement.

Le script :

1. Vérifie la signature binaire du fichier (version InterBase/Firebird, page size).
2. Démarre un serveur Firebird 2.5 dans Docker.
3. Liste toutes les tables et colonnes de votre base.

**À la fin, copiez-collez TOUTE la sortie dans la conversation.** Avec la liste
réelle des tables/colonnes, je finalise le script de migration (étape 2) avec le
mapping précis vers le schéma PostgreSQL de Primia (patients, praticiens,
consultations, documents, courriers).

## Schéma cible

`schema.sql` est **généré depuis le schéma Prisma fusionné** (15 tables :
Patient, Praticien avec auth, Antecedent, Traitement, Allergie, Consultation,
Document, GabaritCourrier, Courrier, Ordonnance, Prescription, RendezVous,
AuditLog, Correspondant, ConstanteBio). Consultation/Courrier `patientId`
nullable (zéro perte). Régénérer après toute évolution du schéma :

```bash
cd packages/db
DATABASE_URL="postgres://x" npx prisma migrate diff \
  --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > ../migration/schema.sql
```

## Étape 2 — Migration (maintenant disponible)

Le script `migrate.py` réalise l'import complet MagicMed → Primia :

| MagicMed | → Primia | Contenu |
|---|---|---|
| PATIENT | Patient | identité, NIR, coordonnées (61 colonnes analysées) |
| DONNEEPRATICIEN | Praticien | nom, RPPS, spécialité |
| PATIENTCONSULT | Consultation | date, praticien, texte de consultation |
| DOCUMENT | Document | GED : référence documentaire par patient |
| MODELEDOCUMENT(+ENT) | GabaritCourrier | gabarits de documents/courriers |
| PRESCRIPTIONS | Courrier | ordonnances/textes avec statut VALIDÉ |

Tables volontairement hors périmètre v1 : MSG_* (messagerie), CPS_* (carte pro),
SMS, VIDAL*/MEDICAMENTS/CCAM* (référentiels), ENCAISSEMENTS (facturation),
AGENDA (à planifier en v2). Enfants/riens de perdu : la base d'origine reste
intacte, on peut étendre le mapping plus tard.

Lancement (les deux conteneurs doivent tourner) :

```bash
docker compose up -d
python3 migrate.py
```

Identifiants PostgreSQL cible : `primia:primia@localhost:54329/primia`.

## Accès aux conteneurs

- Firebird : port `localhost:30550`, SYSDBA/masterkey.
- PostgreSQL : `postgresql://primia:primia@localhost:54329/primia`.

## Notes

- Ne modifiez jamais le `.ITB` original : le kit n'y accède qu'en lecture. Faites
  quand même une copie de sauvegarde avant.
- Si la base est en fait une base InterBase 7+ (rare), l'étape d'analyse le
  détectera via la signature et on adaptera l'image Docker.
