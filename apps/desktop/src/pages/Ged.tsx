import { useEffect, useState } from "react";
import { api, DocumentRow, Patient } from "../lib/api";

const TYPES = [
  "COURRIER",
  "COMPTE_RENDU",
  "ORDONNANCE",
  "RESULTAT_EXAMEN",
  "IMAGERIE",
  "********",
  "FACTURE",
  "AUTRE",
];

export default function Ged() {
  const [recherche, setRecherche] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [typeDoc, setTypeDoc] = useState("AUTRE");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setPatients([]);
      return;
    }
    api
      .listPatients(recherche)
      .then(setPatients)
      .catch(() => setPatients([]));
  }, [recherche]);

  async function rafraichir() {
    try {
      setDocuments(await api.listDocuments(patient?.id ?? null));
    } catch {
      setDocuments([]);
    }
  }

  useEffect(() => {
    rafraichir();
  }, [patient?.id]);

  async function importer() {
    setErreur(null);
    setStatut(null);
    setImportEnCours(true);
    try {
      const chemin = await import("@tauri-apps/plugin-dialog").then((d) =>
        d.open({ multiple: false })
      );
      if (!chemin) return;
      const cheminStr = Array.isArray(chemin) ? chemin[0] : String(chemin);
      const nomFichier = cheminStr.split(/[\\/]/).pop() ?? "document";
      const id = await api.importDocument({
        patientId: patient?.id ?? null,
        nomFichier,
        chemin: cheminStr,
        typeDoc,
      });
      setStatut(`Document importé (${id.slice(0, 8)}…)`);
      rafraichir();
    } catch (err) {
      setErreur(String(err));
    } finally {
      setImportEnCours(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">GED — MagicGed</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="font-semibold">Importer un document</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Patient (optionnel)
            </label>
            {patient ? (
              <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2">
                <span className="font-medium">
                  {patient.prenoms} {patient.nom}
                </span>
                <button
                  onClick={() => setPatient(null)}
                  className="text-xs text-sky-600 hover:underline"
                >
                  Changer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 w-64"
                  placeholder="Rechercher un patient…"
                />
                {patients.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {patients.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => setPatient(p)}
                          className="w-full text-left px-3 py-2 hover:bg-sky-50"
                        >
                          {p.prenoms} {p.nom}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Type</label>
            <select
              value={typeDoc}
              onChange={(e) => setTypeDoc(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={importer}
            disabled={importEnCours}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            {importEnCours ? "Import…" : "📥 Choisir un fichier"}
          </button>
        </div>
        {statut && <p className="text-sm text-emerald-600">{statut}</p>}
        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="font-semibold p-4 border-b border-slate-100">
          Documents {patient ? `de ${patient.prenoms} ${patient.nom}` : "(tous patients)"}
        </h2>
        {documents.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aucun document.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Nom du fichier</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date d'import</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-sky-50">
                  <td className="px-4 py-2 font-medium">{d.nomFichier}</td>
                  <td className="px-4 py-2">{d.type}</td>
                  <td className="px-4 py-2">
                    {new Date(d.createdAt).toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
