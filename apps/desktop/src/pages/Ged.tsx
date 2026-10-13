import { useEffect, useState } from "react";
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
  const [scanners, setScanners] = useState<string[]>([]);
  const [scanner, setScanner] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [scanEnCours, setScanEnCours] = useState(false);

  useEffect(() => {
    api
      .listerScanners()
      .then((s) => {
        setScanners(s);
        if (s.length > 0) setScanner(s[0]);
      })
      .catch((e) => setErreur(String(e)));
  }, []);

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

  async function lancerScanMasse() {
    if (!scanner) return;
    setScanEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      const dossierGed = await import("@tauri-apps/api/path").then((p) =>
        p.appDataDir().then((d) => d + "ged")
      );
      const res = await api.scanMasse(
        scanner,
        dossierGed,
        patientId || null,
        typeDoc
      );
      setStatut(
        `Scan terminé : ${res.nbPages} page(s), document ${res.idDocument.slice(0, 8)}… indexé (OCR)`
      );
    } catch (e) {
      setErreur(String(e));
    } finally {
      setScanEnCours(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">GED — MagicGed</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
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
            📥 Importer un fichier
            <input type="file" className="hidden" onChange={importerFichier} />
          </label>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="font-semibold mb-3">Scan de masse (chargeur ADF)</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Scanner</label>
              <select
                value={scanner}
                onChange={(e) => setScanner(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white min-w-64"
                disabled={scanners.length === 0}
              >
                {scanners.length === 0 && <option>Aucun scanner détecté</option>}
                {scanners.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={lancerScanMasse}
              disabled={scanEnCours || !scanner}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40"
            >
              {scanEnCours ? "⏳ Scan + OCR en cours…" : "📄 Scanner en masse"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Les pages sont assemblées en PDF puis reconnues par OCR (Tesseract,
            français) et indexées pour la recherche plein texte.
          </p>
        </div>

        {statut && <p className="text-sm text-emerald-600">{statut}</p>}
        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
      </div>
    </div>
  );
}
