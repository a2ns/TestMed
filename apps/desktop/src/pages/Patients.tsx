import { useEffect, useState } from "react";
import { api, Patient } from "../lib/api";

export default function Patients() {
  const [recherche, setRecherche] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setPatients([]);
      return;
    }
    setChargement(true);
    setErreur(null);
    api
      .listPatients(recherche)
      .then(setPatients)
      .catch((e) => setErreur(String(e)))
      .finally(() => setChargement(false));
  }, [recherche]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Patients</h1>
        <button className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700">
          + Nouveau patient
        </button>
      </div>
      <input
        autoFocus
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par nom ou prénom…"
        className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
      />
      {chargement && <p className="mt-4 text-sm text-slate-500">Recherche…</p>}
      {erreur && (
        <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>
      )}
      {patients.length > 0 && (
        <table className="mt-6 w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left">
          <thead className="bg-slate-100 text-sm text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Prénoms</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-sky-50">
                <td className="px-4 py-2 font-medium">{p.nom}</td>
                <td className="px-4 py-2">{p.prenoms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
