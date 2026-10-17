# Base de données MagicMed — Documentation complète

> Issue de l'exploration réelle de `MAGICMED.ITB` (3,4 Go) durant la migration
> vers Primia. Tous les faits ci-dessous ont été vérifiés sur la base de production.

## 1. Caractéristiques générales

| Propriété | Valeur |
|---|---|
| Fichier | `MAGICMED.ITB` (extension propriétaire, ~3,4 Go) |
| Format réel | **Firebird 2.0** (ODS 11.0 — détecté via `found 32779` = 0x800B) |
| Page size | 4 Ko |
| Encodage texte | Windows-1252 (CP1252) |
| Tables | **108** (hors tables système) |
| Verrouillage éditeur | Rôle SQL nommé `SYSDBA` bloquant la connexion SYSDBA (contourné par copie patchée `SYSDBA` → `SYSDBB`, même longueur d'octets) |
| Accès en lecture | Firebird 2.5 (Docker `jacobalberty/firebird:v2.5.9-ss`), compte dédié, base patchée `*-sysdbb.itb` |

## 2. Volumétrie des tables principales (comptage réel)

| Table | Lignes | Rôle |
|---|---|---|
| `PATIENT` | 9 561 | Patients (61 colonnes) |
| `PATIENTCONSULT` | 312 113 | Consultations (1 ligne/consultation) |
| `PRESCRIPTIONS` | 302 333 | Ordonnances/documents liés aux consultations (`CONS_ID` → consultation) |
| `LOGMMED` | 311 504 | Journal d'accès (audit interne) |
| `CATEGORISATION` | 214 501 | Catégorisation des documents |
| `DOCUMENT` | 82 340 | Documents GED (références) |
| `PATIENTENCAISSEMENTS` | 26 556 | Paiements |
| `PATIENTSUIVI` | 18 079 | **Constantes/mesures** (poids, tension…) |
| `PATIENTATCD` | 1 309 | Antécédents |
| `PATIENTCORRESPONDANT` | 475 | Correspondants (adresseurs) |
| `PATIENTSV` | 2 689 | Données carte Vitale (regroupements) |
| `DONNEEPRATICIEN` | 290 | Praticiens du cabinet |
| `MEDICAMENTS` / `VIDALPRODUCT` | 3 859 / 4 281 | Référentiel médicaments |
| `CCAMACTES` | 12 628 | Nomenclature CCAM |
| `CODESPOSTAUXCOMMUNES` | 38 950 | Référentiel communes |
| `VACCINS_PATIENTS` | 577 | Vaccinations |

Tables vides ou quasi vides (fonctionnalités non utilisées) : `CONSULTTEXTE`,
`CONSULTDOCUMENT`, `CONSULTDESSIN`, `PATIENTCONSULTDATA`, `PATIENTCONSULTMOTIF`,
`MSG_*` (messagerie interne), `SMS`, `HOSPITALISATION`, `MODELE*` (gabarits)…

## 3. Colonnes clés

### `PATIENT` (extrait)
`NUM_PAT` (PK), `NOM_PAT`, `PRE_PAT`, `NJF_PAT` (nom de jeune fille), `BIRTH_PAT`,
`NSS_PAT` (NIR), `SEXE` (`M`/`F`), `ADRESSE1`, `CPADRPAT`, `VILLEPAT`, `TELPERSO`,
`PORTABLE`, `EMAIL`, `MUTUELLE`, `PROFESSIONS`, `MEDECIN TRAITANT` via
`PATIENTCORRESPONDANT.MEDTRAITANT`, `DECES`, divers BLOB d'historique
(`CONSULTATION1`, `AC`, `AO`, `CERTIF`, `ORDO`…).

### `PATIENTCONSULT`
`CONS_ID` (PK), `NUM_PAT`, `PRATICIEN`, `DATE_CONSULT`, `HEURE_CONSULT`,
`CONSULTATION` (BLOB — contenu riche, voir §4), `DATE_SUPPR`, `CONS_ID_REF`.

### `PRESCRIPTIONS`
`NUMPRESCRIPTION` (PK), `NUMPATIENT`, **`CONS_ID`** (FK vers la consultation —
273 807 lignes portent un `CONS_ID` non null), `DATECONSULT`, `PRESCRIPTION`
(BLOB), `PRESCRIPTIONHORSALD` (BLOB), `RESUME` (VARCHAR 500), `MODALITE`,
`TYPEDOCUMENT`, `CLASSDOC`.

### `PATIENTSUIVI`
`ID`, `NUM_PAT`, `SUIVI` (code du type de mesure — légende dans `CONFBIOMETRIE`),
`DATE_SUIVI`, `TEXTE` (valeur affichable, ex. « 130/70 »), `NOMBRE` (valeur
numérique principale, ex. 130), `ENTIER` (valeur secondaire, ex. 70 = diastolique).

Exemples réels : `158` (poids), `130/70` (TA), `75` (pouls), `166` (taille).

### `DOCUMENT`
`IDDOC` (PK), `NUM_PAT`, `OBJET`, `ETIQUETTE`, `TYPEDOCUMENT`, `DATEDOCUMENT`,
`NOMPAT`/`PREPAT` (dénominations dupliquées), `STATUTDOC`.

## 4. Formats internes découverts (le cœur de la rétro-ingénierie)

### 4.1 Le BLOB `PATIENTCONSULT.CONSULTATION` : format **RichView** (Delphi)

Distribution réelle (sur les consultations ayant une prescription) :
`INCONNU` 194 580 · `RTF` 1 · `NULL` 14 — taille typique **900 à 2 600 octets**.

Structure décodée (spécimens hexadécimaux réels) :

```
-8 1 3 1 \r -9 2 0 0 2 0 1 \r RVStyle \r !.....  StyleName. Normal TextSizeDouble..
FontName..Arial.Unicode .Size. ... StyleName..Heading ... [feuille de style]
[puis] le texte du document
```

- Chaque document commence par des **marqueurs de sections** (lignes ASCII du
  type `-8 1 3 1`, `-9 2 0 0 2 0 1`) ;
- suit un bloc `RVStyle` : la **feuille de style** du composant RichView
  (StyleName, FontName, fsBold, VShift, Color…) — à ignorer ;
- puis le **texte du compte rendu**, encodé en **paires d'octets**
  (caractère + padding `0x2E`) — ex. décodé :
  `« ultation : RASACHAK le 11/07/2018 14:29:15 --- Vient pour RO »`
  (le spécimen commençait en milieu de mot « consultation ») ;
- l'alignement des paires est détecté automatiquement (phase 0/1, score
  d'imprimabilité ASCII) — voir `migration/decode_richview.py`.

**Le marqueur `-8 1 3 1` visible dans l'IHM Primia avant correction** venait de
la migration initiale : le BLOB est du texte ASCII structuré, pas du binaire
opaque ; la 1re extraction ne capturait que le premier marqueur.

### 4.2 BLOB `PRESCRIPTIONS.PRESCRIPTION`

Contient la **nomination médicamenteuse** (ex. `ELISOR / TEMESTA / LEVOTHYROX /
DERMOVAL / INEXIUM / METEOSPASMYL / EFFERALGAN`) — la liste des médicaments
prescrits, pas le compte rendu. Une consultation peut avoir **plusieurs**
prescriptions (~32 en moyenne sur les anciennes lignes → l'extraction de
273 807 prescriptions a produit 8,9 millions de lignes brutes à dédoublonner).

### 4.3 RTF

Une partie des textes (69 000 consultations + 238 815 courriers) est en **RTF**
classique (`{\rtf1\ansi\ansicpg1252...}`), avec fonttbl variable (1 à 3
sous-groupes) — converti en HTML par `migration/rtf_vers_html.py`
(gras/italique/souligné/listes préservés).

### 4.4 Marqueurs binaires 4 octets

Certains champs affichaient `-8 1 3 1` / `-8 1 3 2` : ce sont les **premiers
marqueurs du flux RichView** (voir 4.1), pas des pointeurs morts.

## 5. Mapping de migration MagicMed → Primia

| MagicMed | Primia (PostgreSQL) | Volume migré | Notes |
|---|---|---|---|
| `PATIENT` | `Patient` | 9 560 | identité, NIR, coordonnées ; adresse concaténée (`rue - CP - ville`) |
| `DONNEEPRATICIEN` | `Praticien` | 3 | dédoublonné par `NUSER` (290 lignes source) |
| `PATIENTCONSULT` | `Consultation` | 301 195 | `patientId` nullable (zéro perte, FK `SetNull`) |
| `DOCUMENT` | `Document` | 10 261 | référence ; fichiers physiques hors base |
| `MODELEDOCUMENT(+ENT)` | `GabaritCourrier` | 3 | gabarits |
| `PRESCRIPTIONS` | `Courrier` | 293 428 | contenu BLOB ; repli `RESUME` |
| `PATIENTSUIVI` | `ConstanteBio` | 18 079 | à migrer (légende `CONFBIOMETRIE` requise) |
| `PATIENTATCD` | `Antecedent` | 1 309 | à migrer (v2) |

UUIDs **déterministes** : `uuid5(NAMESPACE_DNS, "magicmed:<table>:<pk>")` —
les liens entre tables survivent à la migration et permettent des
rattrapages ciblés (ex. récupération des textes RichView après coup).

## 6. Pièges rencontrés (à retenir)

1. `HEX()`, `LEFT(CAST(blob AS VARCHAR(n)))` → erreurs Firebird 2.0 ;
   préférer `SUBSTRING`, `OCTET_LENGTH`, `CHARACTER SET OCTETS`.
2. `ORDER BY 2` interdit sur `GROUP BY` concaténé ; `ROWS n` seul invalide
   (utiliser `FIRST n`).
3. BLOB > 32 000 caractères : le `CAST` fait échouer **toute la requête** —
   extraire par lots (~300) avec repli.
4. isql sort ses erreurs sur **stdout** ; le code de sortie reste 0 même en
   échec → vérifier le texte de sortie.
5. Les dates Firebird sortent en `AAAA-MM-JJ` via concaténation `||` —
   compatibles PostgreSQL directement.
6. `\copy` psql : commande client, impossible dans un `-c` multi-instructions ;
   l'export CSV (`\copy ... TO ... WITH CSV`) est la voie robuste pour les
   champs multi-lignes.

## 7. Scripts du kit (dossier `migration/`)

| Script | Rôle |
|---|---|
| `analyse.sh` | Ouverture + extraction du schéma (étape 1) |
| `migrate.py` | Migration principale (6 tables) |
| `patch_role.py` | Copie patchée SYSDBA→SYSDBB (contournement du verrou éditeur) |
| `rtf_vers_html.py` | Conversion RTF → HTML (CSV robuste) |
| `decode_richview.py` | Décodeur du format RichView (paires d'octets + filtres de style) |
| `recupere_textes_consultations.py` | Rattrapage des textes via `PRESCRIPTIONS.CONS_ID` |
| `compte_tables.sh` | Comptage des 108 tables |
| `echantillonne_consultations.sh` / `sonde_binaire.sh` | Sondes de diagnostic |
