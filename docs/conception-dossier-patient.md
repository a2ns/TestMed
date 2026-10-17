# Primia — Dossier Patient : conception cible

> Dédite du schéma MagicMed (108 tables analysées) et du parcours médecin réel.
> Objectif : le médecin ouvre un patient et voit TOUT son dossier, comme dans
> MagicMed — en mieux.

## 1. Ce que le médecin faisait dans MagicMed (déduit du schéma)

1. **Ouvre le dossier patient** (PATIENT : identité, NIR, carte Vitale, mutuelle)
2. **Consulte** : les consultations passées (PATIENTCONSULT), leurs textes rédigés
   (RichView), motifs, praticien
3. **Voit d'un coup d'œil** : antécédents (PATIENTATCD, CIM10), allergies,
   traitements en cours (PRESCRIPTIONSDET : médicaments VIDAL + posologie)
4. **Les résultats de labo** (PATIENTVALTSH : valeurs biologiques datées)
   et les constantes mesurées au cabinet (PATIENTSUIVI : TA, poids, taille, IMC)
5. **Rédige** : ordonnances (PRESCRIPTIONS + lignes détaillées : médicament,
   quantité, forme, moment de prise, durée), courriers (MODELEDOCUMENT + templates)
6. **Archive** : documents scannés/reçus (DOCUMENT + CATEGORISATION), avec
   mots-clés et recherche plein texte (FULLTEXT)
7. **Suit** : vaccinations (VACCINS_PATIENT), hospitalisations

## 2. Schéma cible (évolutions du schéma Primia actuel)

Modèles existants conservés (Patient, Praticien, Consultation, Antecedent,
Allergie, Traitement, ConstanteBio, Document, Courrier, Ordonnance, Prescription,
RendezVous, AuditLog, Correspondant, GabaritCourrier).

Nouvelles tables :

- **BioResultat** (résultats de laboratoire, de PATIENTVALTSH) :
  id, patientId, code (ex. glycémie, NFS), libelle, valeur, unite, date,
  praticienId — l'onglet « Bio » affiche les résultats par date, valeurs
  anormales signalées.
- **Vaccination** (de VACCINS_PATIENT) : id, patientId, vaccin, date,
  dateRappel, lot.
- **Hospitalisation** (de HOSPITALISATION) : id, patientId, entree, sortie.

Évolutions des modèles existants :

- **Traitement** : migré depuis PRESCRIPTIONSDET (70 314 lignes) —
  medicament (VIDALPRODUCT/CIP), posologie (UNITEPRESCRITE + QUAND),
  duree, dateDebut = DATECONSULT de la prescription, actif si prescription
  non supprimée.
- **Document** : ajout de `contenu` (texte OCR/éventuel) et `format` —
  l'onglet Documents liste par type + date, ouvre le fichier.
- **Consultation / Courrier** : conservation du format d'origine :
  colonne `format` (HTML | RTF | RICHVIEW | TEXTE) ; le texte décodé est
  stocké en HTML (lecture directe), le brut original n'est jamais requis
  à l'affichage (déjà décodé à la migration).

## 3. IHM cible — la Fiche Patient devient le Dossier Patient

Structure en onglets (tout consultable, tout daté, tout lisible) :

- **Synthèse** (colonne gauche actuelle) : identité, dernières constantes,
  alertes (allergies, antécédents actifs), derniers événements
- **Consultations** : liste chronologique dépliante — chaque consultation
  montre date, motif, texte enrichi complet (lisible en entier, pas tronqué)
- **Antécédents** : groupés par catégorie, CIM10 visible, année
- **Traitements** : en cours (actifs) puis historique, posologie claire
- **Allergies** : substance + gravité, en alerte
- **Bio** : résultats de laboratoire par date (BioResultat) + constantes du
  cabinet (ConstanteBio) avec évolution (dernière valeur, tendance)
- **Courriers & Ordonnances** : tous les documents émis, par date, texte
  complet lisible (format enrichi rendu nativement)
- **Documents (GED)** : tous les documents reçus/scannés, par type et date
- **Vaccins** : statut vaccinal

Chaque liste est **complète et paginée** (pas de LIMIT 50 qui masque
l'historique), chaque élément est **ouvrable en lecture intégrale**.

## 4. Lecture des formats enrichis

Le décodeur RichView (migration) produit du HTML simple (strong/em/u/ul).
L'IHM rend ce HTML via NotesRiches (sanitisé). Les RTF ont été convertis en
HTML à la migration. Le format d'origine est conservé en colonne `format`
pour traçabilité ; l'affichage est natif HTML — pas de re-conversion à
la lecture, pas de perte.
