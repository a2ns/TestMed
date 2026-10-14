import { useEffect, useState } from "react";
import { api, Patient } from "../lib/api";

export default function Patients() {
  const [recherche, setRecherche] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouveau, setNouveau] = useState({
    nom: "",
    prenoms: "",
    dateNaissance: "",
    sexe: "",
    telephone: "",
    email: "",
    medecinTraitant: "",
  });

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

  async function creerPatient() {
    if (!nouveau.nom.trim() || !nouveau.prenoms.trim()) return;
    setErreur(null);
    try {
      const p = await api.creerPatient({
        nom: nouveau.nom.trim(),
        prenoms: nouveau.prenoms.trim(),
        dateNaissance: nouveau.dateNaissance || null,
        sexe: nouveau.sexe || null,
        telephone: nouveau.telephone || null,
        email: nouveau.email || null,
        medecinTraitant: nouveau.medecinTraitant || null,
      });
      setPatients((prev) => [p, ...prev]);
      setFormulaireOuvert(false);
      setNouveau({
        nom: "",
        prenoms: "",
        dateNaissance: "",
        sexe: "",
        telephone: "",
        email: "",
        medecinTraitant: "",
      });
    } catch (e) {
      setErreur(String(e));
    }
  }

  const champ =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400";

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Patients</h1>
        <button
          onClick={() => setFormulaireOuvert(!formulaireOuvert)}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700"
        >
          + Nouveau patient
        </button>
      </div>

      {formulaireOuvert && (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold">Créer un patient</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Nom *</label>
              <input
                value={nouveau.nom}
                onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Prénoms *</label>
              <input
                value={nouveau.prenoms}
                onChange={(e) => setNouveau({ ...nouveau, prenoms: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Date de naissance
              </label>
              <input
                type="date"
                value={nouveau.dateNaissance}
                onChange={(e) =>
                  setNouveau({ ...nouveau, dateNaissance: e.target.value })
                }
                className={champ}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Sexe</label>
              <select
                value={nouveau.sexe}
                onChange={(e) => setNouveau({ ...nouveau, sexe: e.target.value })}
                className={champ}
              >
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Téléphone</label>
              <input
                value={nouveau.telephone}
                onChange={(e) =>
                  setNouveau({ ...nouveau, telephone: e.target.value })
                }
                className={champ}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Email</label>
              <input
                value={nouveau.email}
                onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Médecin traitant
              </label>
              <input
                value={nouveau.medecinTraitant}
                onChange={(e) =>
                  setNouveau({ ...nouveau, medecinTraitant: e.target.value })
                }
                className={champ}
              />
            </div>
          </div>
          <button
            onClick={creerPatient}
            disabled={!nouveau.nom.trim() || !nouveau.prenoms.trim()}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            Créer le patient
          </button>
        </div>
      )}

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par nom ou prénom…"
        className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
      />
      {chargement && <p className="mt-4 text-sm text-slate-500">Recherche…</p>}
      {erreur && <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>}
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
