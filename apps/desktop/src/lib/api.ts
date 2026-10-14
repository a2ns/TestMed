export type Patient = {
  id: string;
  nom: string;
  prenoms: string;
};

export type CourrierGenere = { contenu: string };

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Import dynamique : permet aussi le rendu hors Tauri (dev navigateur).
  return import("@tauri-apps/api/core").then((m) =>
    m.invoke<T>(cmd, args)
  );
}

export type Utilisateur = {
  id: string;
  identifiant: string;
  nom: string;
  prenoms: string;
  role: string;
  rpps: string | null;
  cabinetNom: string | null;
  cabinetAdresse: string | null;
  telephone: string | null;
  email: string | null;
};

export type PatientDetail = {
  id: string;
  nom: string;
  prenoms: string;
  dateNaissance: string | null;
  sexe: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  medecinTraitant: string | null;
  nir: string | null;
};

export type NouveauPatient = {
  nom: string;
  prenoms: string;
  dateNaissance: string | null;
  sexe: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  medecinTraitant: string | null;
  nir: string | null;
};

export type Consultation = {
  id: string;
  patientId: string;
  motif: string | null;
  notes: string | null;
  date: string;
};

export type Antecedent = {
  id: string;
  categorie: string;
  libelle: string;
  annee: number | null;
  notes: string | null;
};

export type Traitement = {
  id: string;
  medicament: string;
  posologie: string;
  duree: string | null;
  actif: boolean;
};

export type Allergie = {
  id: string;
  substance: string;
  gravite: string;
  reactions: string | null;
};

export type Ordonnance = {
  id: string;
  patientId: string;
  type: "SIMPLE" | "BI_ORDONNANCE" | "SECURISEE";
  securisee: boolean;
  date: string;
};

export type PrescriptionLigne = {
  id: string;
  zone: string;
  medicament: string;
  cip: string | null;
  posologie: string;
  duree: string | null;
  dureeJours: number | null;
  substitution: boolean;
  renouvellements: number;
  position: number;
};

export type NouvellePrescription = {
  zone: string;
  medicament: string;
  cip: string | null;
  posologie: string;
  duree: string | null;
  dureeJours: number | null;
  substitution: boolean;
  renouvellements: number;
};

export type RendezVous = {
  id: string;
  patientId: string;
  nomPatient: string;
  prenomsPatient: string;
  debut: string;
  dureeMin: number;
  statut: "PLANIFIE" | "ARRIVE" | "HONORE" | "ANNULE";
  motif: string | null;
};

export type ImportIntelligentResultat = {
  idDocument: string;
  patientId: string | null;
  aTrier: boolean;
  texteOcr: string;
};

export type ResultatDocument = {
  id: string;
  patientId: string | null;
  nomPatient: string | null;
  nomFichier: string;
  type: string;
  extrait: string | null;
  createdAt: string;
};

export type EntreeAudit = {
  id: number;
  ts: string;
  userId: string;
  action: string;
  cibleType: string | null;
  cibleId: string | null;
  detail: unknown;
};

export type Scanner = string;

export type ScanResultat = {
  idDocument: string;
  nbPages: number;
  texteOcr: string;
};

export type CourrierImpression = {
  praticien: string;
  cabinet: string;
  patient: string;
  destinataire: string;
  objet: string;
  corps: string;
  signature: string;
};

export const api = {
  listPatients: (recherche: string) =>
    invoke<Patient[]>("list_patients", { recherche }),
  getPatient: (id: string, token: string) => invoke<PatientDetail>("get_patient", { id, token }),
  creerPatient: (p: NouveauPatient) => invoke<string>("creer_patient", { p }),
  listConsultations: (patientId: string) =>
    invoke<Consultation[]>("list_consultations", { patientId }),
  creerConsultation: (patientId: string, motif: string, notes: string) =>
    invoke<string>("creer_consultation", { c: { patientId, motif, notes } }),
  listAntecedents: (patientId: string) =>
    invoke<Antecedent[]>("list_antecedents", { patientId }),
  creerAntecedent: (
    patientId: string,
    categorie: string,
    libelle: string,
    annee: number | null,
    notes: string | null
  ) =>
    invoke<string>("creer_antecedent", {
      a: { patientId, categorie, libelle, annee, notes },
    }),
  listTraitements: (patientId: string) =>
    invoke<Traitement[]>("list_traitements", { patientId }),
  creerTraitement: (patientId: string, medicament: string, posologie: string, duree: string | null) =>
    invoke<string>("creer_traitement", { t: { patientId, medicament, posologie, duree } }),
  listAllergies: (patientId: string) =>
    invoke<Allergie[]>("list_allergies", { patientId }),
  creerAllergie: (patientId: string, substance: string, gravite: string, reactions: string | null) =>
    invoke<string>("creer_allergie", { a: { patientId, substance, gravite, reactions } }),
  creerOrdonnance: (
    patientId: string,
    type: string,
    securisee: boolean,
    lignes: NouvellePrescription[],
    token: string
  ) =>
    invoke<string>("creer_ordonnance", {
      o: { patientId, type, securisee, lignes },
      token,
    }),
  listOrdonnances: (patientId: string) =>
    invoke<Ordonnance[]>("list_ordonnances", { patientId }),
  getPrescriptions: (ordonnanceId: string) =>
    invoke<PrescriptionLigne[]>("get_prescriptions", { ordonnanceId }),
  listRdvJour: (jour: string) => invoke<RendezVous[]>("list_rdv_jour", { jour }),
  creerRdv: (patientId: string, debut: string, dureeMin: number, motif: string | null, notes: string | null) =>
    invoke<string>("creer_rdv", { r: { patientId, debut, dureeMin, motif, notes } }),
  changerStatutRdv: (id: string, statut: string) =>
    invoke<void>("changer_statut_rdv", { id, statut }),
  supprimerRdv: (id: string, token: string) =>
    invoke<void>("supprimer_rdv", { id, token }),
  modifierRdv: (id: string, debut: string, dureeMin: number, motif: string | null, token: string) =>
    invoke<void>("modifier_rdv", { m: { id, debut, dureeMin, motif }, token }),
  rechercheDocuments: (recherche: string, typeDoc: string | null, token: string) =>
    invoke<ResultatDocument[]>("recherche_documents", { recherche, typeDoc, token }),
  rechercheMulti: (criteres: {
    texte: string | null;
    patientId: string | null;
    typeDoc: string | null;
    dateDebut: string | null;
    dateFin: string | null;
  }, token: string) =>
    invoke<ResultatDocument[]>("recherche_multi", {
      texte: criteres.texte,
      patientId: criteres.patientId,
      typeDoc: criteres.typeDoc,
      dateDebut: criteres.dateDebut,
      dateFin: criteres.dateFin,
      token,
    }),
  listDocuments: (patientId: string | null) =>
    invoke<ResultatDocument[]>("list_documents", { patientId }),
  importerIntelligent: (chemin: string, nomFichier: string, typeDoc: string, patientIndice: string | null, token: string) =>
    invoke<ImportIntelligentResultat>("importer_document_intelligent", { chemin, nomFichier, typeDoc, patientIndice, token }),
  listDocumentsATrier: (token: string) =>
    invoke<ResultatDocument[]>("list_documents_a_trier", { token }),
  compterATrier: (token: string) => invoke<number>("compter_a_trier", { token }),
  classerDocument: (documentId: string, patientId: string, typeDoc: string | null, token: string) =>
    invoke<void>("classer_document", { documentId, patientId, typeDoc, token }),
  supprimerDocument: (id: string, token: string) =>
    invoke<void>("supprimer_document", { id, token }),
  ouvrirDocument: (id: string, token: string) =>
    invoke<void>("ouvrir_document", { id, token }),
  enregistrerCourrierGed: (c: {
    patientId: string;
    nomFichier: string;
    chemin: string;
    contenu: string;
  }, token: string) => invoke<string>("enregistrer_courrier_ged", { c, token }),
  testerIa: (token: string) =>
    invoke<{ operationnel: boolean; baseUrl: string; modele: string; reponse: string }>(
      "tester_ia", { token }
    ),
  reformulerTexte: (texte: string, consigne: string, token: string) =>
    invoke<string>("reformuler_texte", { texte, consigne, token }),
  assisterIa: (tache: string, entree: string, contextePatient: { allergies: string[]; traitements: string[] } | null, token: string) =>
    invoke<string>("assister_ia", { tache, entree, contextePatient, token }),
  extraireConstantesIa: (texteOcr: string, token: string) =>
    invoke<{ type: string; valeur: string; unite: string | null }[]>(
      "extraire_constantes_ia", { texteOcr, token }
    ),
  analyserDocumentIa: (texteOcr: string, token: string) =>
    invoke<{ typeDocument: string; nomPatient: string | null; confiance: number; commentaire: string | null }>(
      "analyser_document_ia", { texteOcr, token }
    ),
  listCorrespondants: (token: string) =>
    invoke<{ id: string; nom: string; specialite: string | null; adresse: string | null; email: string | null; telephone: string | null }[]>(
      "list_correspondants", { token }
    ),
  creerCorrespondant: (c: {
    nom: string;
    specialite: string | null;
    adresse: string | null;
    email: string | null;
    telephone: string | null;
  }, token: string) => invoke<string>("creer_correspondant", { ...c, token }),
  majPatient: (p: {
    id: string;
    nom: string;
    prenoms: string;
    dateNaissance: string | null;
    sexe: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    medecinTraitant: string | null;
    nir: string | null;
  }, token: string) => invoke<void>("maj_patient", { ...p, token }),
  listConstantes: (patientId: string, token: string) =>
    invoke<{ id: string; patientId: string; type: string; valeur: string; unite: string | null; date: string }[]>(
      "list_constantes", { patientId, token }
    ),
  creerConstante: (patientId: string, typeConstante: string, valeur: string, unite: string | null, token: string) =>
    invoke<string>("creer_constante", { patientId, typeConstante, valeur, unite, token }),
  supprimerConsultation: (id: string, token: string) =>
    invoke<void>("supprimer_consultation", { id, token }),
  importDocument: (doc: {
    patientId: string | null;
    nomFichier: string;
    chemin: string;
    typeDoc: string;
  }) => invoke<string>("import_document", { doc }),
  genererCourrier: (req: {
    patientId: string;
    gabarit: string;
    notes: string;
    destinataire: string | null;
    token: string;
  }) => invoke<CourrierGenere>("generer_courrier_ia", { req, token: req.token }),
  majPraticien: (p: {
    id: string;
    nom: string;
    prenoms: string;
    rpps: string | null;
    cabinetNom: string | null;
    cabinetAdresse: string | null;
    telephone: string | null;
    email: string | null;
  }, token: string) => invoke<void>("maj_praticien", { ...p, token }),
  listerScanners: () => invoke<Scanner[]>("lister_scanners"),
  scanMasse: (scanner: string, dossierGed: string, patientId: string | null, typeDoc: string, token: string) =>
    invoke<ScanResultat>("scan_masse", { scanner, dossierGed, patientId, typeDoc, token }),
  imprimerCourrier: (courrier: CourrierImpression, dossierGed: string, archiverEgalement: boolean) =>
    invoke<string>("imprimer_courrier", { courrier, dossierGed, archiverEgalement }),
  connexion: (identifiant: string, motDePasse: string) =>
    invoke<string>("connexion", { identifiants: { identifiant, motDePasse } }),
  utilisateurCourant: (token: string) => invoke<Utilisateur>("utilisateur_courant", { token }),
  deconnexion: (token: string) => invoke<void>("deconnexion", { token }),
  listAuditLog: (adminToken: string, limite: number) =>
    invoke<EntreeAudit[]>("list_audit_log", { adminToken, limite }),
  lancerSauvegarde: (token: string) =>
    invoke<{ chemin: string; tailleOctets: number; tables: number }>("lancer_sauvegarde", { token }),
  verifierFsv: (token: string) =>
    invoke<{ disponible: boolean; detail: string }>("verifier_fsv", { token }),
  verifierDmp: (token: string) =>
    invoke<{ configure: boolean; detail: string }>("verifier_dmp", { token }),
  creerCompte: (identifiant: string, motDePasse: string, role: string, adminToken: string) =>
    invoke<void>("creer_compte", { identifiants: { identifiant, motDePasse }, role, adminToken }),
};
