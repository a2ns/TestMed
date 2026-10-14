import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Patient } from "../lib/api";

export default function Patients() {
  const navigate = useNavigate();
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
        <button
          onClick={() => navigate("/patients/nouveau")}
          className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700"
        >
          + Nouveau patient
        </button>
      </div>
      <input
        autoFocus
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par nom ou prénom…"
        className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-lavande-400"
      />
      {chargement && <p className="mt-4 text-sm text-slate-500">Recherche…</p>}
      {erreur && <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>}
      {patients.length > 0 && (
        <table className="mt-6 w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left">
          <thead className="bg-nuit-100 text-sm text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Prénoms</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                className="border-t border-nuit-100 hover:bg-lavande-50 cursor-pointer"
              >
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
