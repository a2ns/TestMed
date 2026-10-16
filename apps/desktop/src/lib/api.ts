export type Patient = { id: string; nom: string; prenoms: string };

export type CourrierGenere = { contenu: string };

export type CourrierRow = {
  id: string;
  patientId: string;
  sujet: string | null;
  contenu: string;
  aiGenere: boolean;
  statut: string;
  date: string;
};

export type DocumentRow = {
  id: string;
  patientId: string | null;
  nomFichier: string;
  type: string;
  createdAt: string;
};

export type FicheOrpheline = {
  id: string;
  kind: string;
  date: string | null;
  sujet: string | null;
  extrait: string | null;
};

export type OccurrencePatient = {
  id: string;
  nom: string;
  prenoms: string;
  occurrences: number;
};

export type Stats = {
  patientsTotal: number;
  documentsTotal: number;
  consultationsTotal: number;
  courriersBrouillons: number;
  courriersValides: number;
  nonLies: number;
};

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return import("@tauri-apps/api/core").then((m) => m.invoke<T>(cmd, args));
}

export const api = {
  listPatients: (recherche: string) =>
    invoke<Patient[]>("list_patients", { recherche }),
  creerPatient: (req: {
    nom: string;
    prenoms: string;
    dateNaissance: string | null;
    sexe: string | null;
    telephone: string | null;
    email: string | null;
    medecinTraitant: string | null;
  }) => invoke<Patient>("creer_patient", { req }),
  importDocument: (doc: {
    patientId: string | null;
    nomFichier: string;
    chemin: string;
    typeDoc: string;
  }) => invoke<string>("import_document", { doc }),
  listDocuments: (patientId: string | null) =>
    invoke<DocumentRow[]>("list_documents", { patientId }),
  genererCourrier: (req: { patientId: string; gabarit: string; notes: string }) =>
    invoke<CourrierGenere>("generer_courrier_ia", { req }),
  reformulerCourrier: (req: {
    patientId: string;
    contenu: string;
    consigne: string;
  }) => invoke<CourrierGenere>("reformuler_courrier_ia", { req }),
  relireCourrier: (contenu: string) =>
    invoke<CourrierGenere>("relire_courrier_ia", { contenu }),
  enregistrerCourrier: (req: {
    patientId: string;
    sujet: string | null;
    contenu: string;
    aiGenere: boolean;
    valide: boolean;
  }) => invoke<CourrierRow>("enregistrer_courrier", { req }),
  listCourriers: (patientId: string | null) =>
    invoke<CourrierRow[]>("list_courriers", { patientId }),
  validerCourrier: (id: string) => invoke<void>("valider_courrier", { id }),
  statistiques: () => invoke<Stats>("statistiques"),
};

export const apiReconciliation = {
  listFichesOrphelines: () => invoke<FicheOrpheline[]>("list_fiches_orphelines"),
  listOccurrencesPatients: () =>
    invoke<OccurrencePatient[]>("list_occurrences_patients"),
  lierFiche: (req: { kind: string; ficheId: string; patientId: string }) =>
    invoke<void>("lier_fiche", { req }),
};
