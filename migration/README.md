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

**Variante B — sans Docker** (Homebrew suffit, plus léger) :

```bash
chmod +x analyse-nodocker.sh
./analyse-nodocker.sh
```

Le script B installe Firebird via Homebrew si besoin (aucune configuration
manuelle : pas de serveur à lancer, la base est lue en direct).

Le script :

1. Vérifie la signature binaire du fichier (version InterBase/Firebird, page size).
2. Démarre un serveur Firebird 2.5 dans Docker.
3. Liste toutes les tables et colonnes de votre base.

**À la fin, copiez-collez TOUTE la sortie dans la conversation.** Avec la liste
réelle des tables/colonnes, je finalise le script de migration (étape 2) avec le
mapping précis vers le schéma PostgreSQL de Primia (patients, praticiens,
consultations, documents, courriers).

## Étape 2 — Migration (à venir)

Une fois l'analyse reçue, un script `migrate.py` sera fourni. Il :

1. Lit la base Firebird table par table (streaming, peu de RAM).
2. Transforme les données selon le mapping validé.
3. Insère dans le PostgreSQL cible (`docker compose up -d postgres`, schéma déjà
   chargé automatiquement — voir `schema.sql`).

## Accès aux conteneurs

- Firebird : port `localhost:30550`, SYSDBA/masterkey.
- PostgreSQL : `postgresql://primia:primia@localhost:54329/primia`.

## Notes

- Ne modifiez jamais le `.ITB` original : le kit n'y accède qu'en lecture. Faites
  quand même une copie de sauvegarde avant.
- Si la base est en fait une base InterBase 7+ (rare), l'étape d'analyse le
  détectera via la signature et on adaptera l'image Docker.
