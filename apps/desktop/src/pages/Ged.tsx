import { useState } from "react";
import { api } from "../lib/api";

const TYPES = [
  "COURRIER",
  "COMPTE_RENDU",
  "ORDONNANCE",
  "RESULTAT_EXAMEN",
  "IMAGERIE",
  "CERTIFICAT",
  "FACTURE",
  "AUTRE",
];

export default function Ged() {
  const [patientId, setPatientId] = useState("");
  const [typeDoc, setTypeDoc] = useState("AUTRE");
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function importerFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    setStatut(null);
    try {
      const chemin = await import("@tauri-apps/plugin-dialog").then((d) =>
        d.open({ multiple: false })
      );
      if (!chemin) return;
      const id = await api.importDocument({
        patientId: patientId || null,
        nomFichier: fichier.name,
        chemin: String(chemin),
        typeDoc,
      });
      setStatut(`Document importé (${id.slice(0, 8)}…)`);
    } catch (err) {
      setErreur(String(err));
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
              ID patient (optionnel)
            </label>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2"
              placeholder="UUID"
            />
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
          <label className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 cursor-pointer">
            📥 Choisir un fichier
            <input type="file" className="hidden" onChange={importerFichier} />
          </label>
        </div>
        {statut && <p className="text-sm text-emerald-600">{statut}</p>}
        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
        <p className="text-xs text-slate-400">
          Scan de masse TWAIN/SANE + OCR Tesseract : branchement phase 2 (core Rust).
        </p>
      </div>
    </div>
  );
}
