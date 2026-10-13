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
  getPatient: (id: string) => invoke<PatientDetail>("get_patient", { id }),
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
  }) => invoke<CourrierGenere>("generer_courrier_ia", { req }),
  listerScanners: () => invoke<Scanner[]>("lister_scanners"),
  scanMasse: (scanner: string, dossierGed: string, patientId: string | null, typeDoc: string) =>
    invoke<ScanResultat>("scan_masse", { scanner, dossierGed, patientId, typeDoc }),
  imprimerCourrier: (courrier: CourrierImpression, dossierGed: string, archiverEgalement: boolean) =>
    invoke<string>("imprimer_courrier", { courrier, dossierGed, archiverEgalement }),
  connexion: (identifiant: string, motDePasse: string) =>
    invoke<string>("connexion", { identifiants: { identifiant, motDePasse } }),
  utilisateurCourant: (token: string) => invoke<Utilisateur>("utilisateur_courant", { token }),
  deconnexion: (token: string) => invoke<void>("deconnexion", { token }),
  creerCompte: (identifiant: string, motDePasse: string, role: string, adminToken: string) =>
    invoke<void>("creer_compte", { identifiants: { identifiant, motDePasse }, role, adminToken }),
};
