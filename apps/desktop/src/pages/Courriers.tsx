import { useState } from "react";
import { api } from "../lib/api";

const GABARITS = [
  { code: "adressage", libelle: "Adressement spécialiste" },
  { code: "compte_rendu", libelle: "Compte rendu de consultation" },
  { code: "certificat", libelle: "Certificat médical" },
];

export default function Courriers() {
  const [patientId, setPatientId] = useState("");
  const [gabarit, setGabarit] = useState(GABARITS[0].code);
  const [notes, setNotes] = useState("");
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function generer() {
    if (!patientId || !notes) return;
    setChargement(true);
    setErreur(null);
    try {
      const res = await api.genererCourrier({ patientId, gabarit, notes });
      setContenu(res.contenu);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Courriers — assistant IA</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              ID patient
            </label>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="UUID du patient"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Gabarit</label>
            <select
              value={gabarit}
              onChange={(e) => setGabarit(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              {GABARITS.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Notes de consultation
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="Motif, examen, conclusion…"
              className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <button
            onClick={generer}
            disabled={chargement || !patientId || !notes}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            {chargement ? "Génération…" : "✨ Générer le courrier"}
          </button>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-slate-500 mb-1">
            Courrier généré (modifiable)
          </label>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={22}
            className="flex-1 w-full border border-slate-300 rounded-lg p-4 bg-white font-serif focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Le brouillon IA apparaîtra ici…"
          />
          <div className="flex gap-3 mt-3">
            <button
              disabled={!contenu}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40"
            >
              🖨️ Imprimer
            </button>
            <button
              disabled={!contenu}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            >
              📁 Archiver dans la GED
            </button>
          </div>
        </div>
      </div>
      {erreur && <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>}
    </div>
  );
}
