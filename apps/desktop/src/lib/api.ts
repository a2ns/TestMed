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

export const api = {
  listPatients: (recherche: string) =>
    invoke<Patient[]>("list_patients", { recherche }),
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
};
