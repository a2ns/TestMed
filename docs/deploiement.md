# Guide de déploiement — Primia

Procédure d'installation poste par poste pour un cabinet médical.

## 1. Serveur de cabinet (PostgreSQL)

Machine dédiée ou NAS du cabinet (sous onduleur, sauvegardé).

```bash
# Debian/Ubuntu
sudo apt install postgresql
sudo -u postgres psql <<'EOF'
CREATE USER magicmed WITH PASSWORD '<mot-de-passe-fort>';
CREATE DATABASE magicmed OWNER magicmed;
EOF
```

Réseau : PostgreSQL doit être joignable uniquement depuis le réseau local
du cabinet (`listen_addresses`, `pg_hba.conf` restreint aux IP des postes,
pare-feu local activé).

Mise à jour du schéma (poste admin) :

```bash
cd packages/db
npm install
DATABASE_URL=postgresql://magicmed:***@serveur:5432/magicmed npm run db:push
ADMIN_MOT_DE_PASSE='<mot-de-passe-admin>' npm run seed   # crée le compte admin
```

## 2. Prérequis communs à chaque poste

- **PostgreSQL client** (`postgresql-client`) : requis pour les sauvegardes pg_dump
- **Tesseract OCR** + pack français :
  - Windows : installeur UB-Mannheim (https://github.com/UB-Mannheim/tesseract/wiki) — composant *French*
  - macOS : `brew install tesseract tesseract-lang`
- **Scanner** :
  - macOS : `brew install sane-backends` (backend SANE), scanner réseau ou USB
  - Windows : pilotes TWAIN du constructeur installés
- `.env` du poste (voir modèle `.env.example`) :

```ini
DATABASE_URL=postgresql://magicmed:***@serveur:5432/magicmed
MAGICMED_CLE_MASTER=<openssl rand -base64 32>   # IDENTIQUE sur tous les postes
AI_BASE_URL=https://api.mistral.ai/v1           # ou http://localhost:11434/v1 (Ollama local)
AI_MODEL=mistral-small-latest
AI_API_KEY=<clé>                                # inutile si Ollama local
MAGICMED_SAUVEGARDE_DOSSIER=/var/backups/magicmed
```

⚠️ **MAGICMED_CLE_MASTER** :
- identique sur tous les postes et le poste qui restaure les sauvegardes
- conservée hors base (coffre, gestionnaire de mots de passe du cabinet)
- perte de la clé = NIR et sauvegardes indéchiffrables ; prévoir une copie scellée

## 3. Poste Windows de facturation (en plus du §2)

Ce poste porte la facturation Vitale :

1. **Contrat GIE SESAM-Vitale** : à initier par le cabinet (délai de plusieurs
   semaines) — accession au service FSV.
2. Installer le **logiciel FSV** fourni par le GIE (sgpv.dll).
3. Brancher le **lecteur de carte certifié** (ex. SprinTUSB) + installer la **CPS**
   du praticien (carte professionnelle).
4. `.env` du poste : `FSV_DLL=C:\Program Files\FSV\sgpv.dll`
5. Dans Primia : *Système* → l'état « Sesam-Vitale (FSV) » doit passer au vert.
   Les commandes de lecture Vitale/FSE seront activées en phase 2 avec la
   spécification GIE du cabinet.

## 4. Poste macOS

```bash
xcode-select --install
brew install rust node sane-backends tesseract tesseract-lang postgresql-client
git clone https://github.com/a2ns/TestMed
cd TestMed/apps/desktop
npm install
npm run tauri dev        # développement
npm run tauri build      # produit .app + .dmg
```

## 5. Compilation des postes Windows

```powershell
winget install Rustlang.Rustup NodeJS.LTS
git clone https://github.com/a2ns/TestMed
cd TestMed\apps\desktop
npm install
npm run tauri dev        # développement
npm run tauri build      # produit .msi (bundling)
```

Distribuer ensuite le `.msi` / `.dmg` aux autres postes du cabinet.

## 6. Assistant IA — 100 % local (recommandé)

Politique de confidentialité médicale : **aucune donnée patient ne doit
quitter le poste**. L'IA tourne donc en local via Ollama :

```bash
brew install ollama
ollama serve &            # ou l'app Ollama au démarrage
ollama pull mistral-nemo  # ~7 Go — excellent en français
```

`.env` du poste :
```ini
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=mistral-nemo
AI_API_KEY=
```

Vérification : Primia → Système → « Tester la connexion IA » → doit
afficher « IA opérationnelle (mistral-nemo @ …) ».

**Architecture multi-poste** : un seul Mac du cabinet peut servir l'IA à
tous les postes — les autres configurent `AI_BASE_URL=http://<ip-du-mac-ia>:11434/v1`.

**Qualité attendue par tâche** : courriers et notes très bons ; analyse de
classement GED (format JSON) correct — à valider sur vos premiers documents
réels. Un modèle plus gros (`mistral-small` 22B, ~14 Go) améliore le suivi
des consignes si la RAM le permet.

**Limite clinique importante** : l'assistant de prescription propose, le
médecin valide — c'est vrai quel que soit le modèle. En local, la vigilance
sur les propositions de posologie doit être encore plus attentive, le
modèle 12B étant moins fiable que les API sur ce point précis.

## 7. Première mise en service

1. Se connecter avec **admin** / mot de passe du seed → changer ce mot de
   passe immédiatement.
2. *Système* → créer les comptes réels (médecins, secrétaires) via la commande
   `creer_compte` (rôle ADMIN requis) ; complété leur fiche praticien
   (nom, RPPS, cabinet).
3. Lancer une **première sauvegarde** et vérifier le fichier chiffré dans le
   dossier de sauvegarde.
4. Tester le scanner (*GED* → « Scanner en masse ») et l'OCR (recherche plein
   texte sur le contenu scanné).
5. Configurer l'IA (Mistral API ou Ollama local selon la politique RGPD du
   cabinet) et générer un courrier test.

## 7. Exploitation quotidienne

| Tâche | Fréquence | Où |
|---|---|---|
| Sauvegarde chiffrée | quotidienne (fin de journée) | *Système* → « Lancer une sauvegarde » |
| Vérification d'une sauvegarde | hebdomadaire | déchiffrer une archive et contrôler le SQL |
| Journal d'audit | mensuel (traces d'accès, échecs de connexion) | *Journal d'audit* |
| Rotation MAGICMED_CLE_MASTER | annuelle (procédure de re-chiffrement requise) | — |
| Mises à jour postes (antivirus, OS) | continues | — |

Planification automatique : programmer un lancement quotidien (Planificateur
de tâches Windows / launchd macOS) appelant la sauvegarde via l'application
admin, ou un `pg_dump` chiffré côté serveur.

## 8. Dépannage rapide

| Symptôme | Cause probable | Correctif |
|---|---|---|
| « base non initialisée » | DATABASE_URL absente/injoignable | vérifier `.env`, réseau, PostgreSQL actif |
| « tesseract introuvable » | OCR absent du PATH | réinstaller tesseract + pack fra, rouvrir l'app |
| « scanimage introuvable » | SANE absent | `brew install sane-backends` (macOS) |
| NIR illisible / sauvegarde indéchiffrable | MAGICMED_CLE_MASTER différente | rétablir la clé du poste |
| FSV au rouge | DLL absente | installer le logiciel FSV du GIE, définir FSV_DLL |
| Conflit de créneau refusé | un RDV chevauche déjà | choisir un autre créneau (voulu) |
