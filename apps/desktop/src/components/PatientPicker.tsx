import { useEffect, useState } from "react";
import { api, Patient } from "../lib/api";

type Props = {
  label?: string;
  patientId: string;
  patientNom: string;
  onSelect: (id: string, nom: string) => void;
};

/// Sélecteur de patient : recherche par nom/prénom, liste de suggestions.
export default function PatientPicker({
  label = "Patient",
  patientId,
  patientNom,
  onSelect,
}: Props) {
  const [recherche, setRecherche] = useState("");
  const [suggestions, setSuggestions] = useState<Patient[]>([]);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    api
      .listPatients(recherche)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [recherche]);

  function choisir(p: Patient) {
    const nom = `${p.prenoms} ${p.nom}`.trim();
    onSelect(p.id, nom);
    setRecherche("");
    setSuggestions([]);
  }

  if (patientId) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm">
          {label} : <span className="font-semibold">{patientNom}</span>
        </span>
        <button
          onClick={() => onSelect("", "")}
          className="text-xs text-red-500 hover:text-red-700"
        >
          ✕ changer
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm text-slate-500 mb-1">{label}</label>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un patient (2 caractères minimum)…"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lavande-400"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg divide-y">
          {suggestions.map((p) => (
            <button
              key={p.id}
              onClick={() => choisir(p)}
              className="block w-full text-left px-3 py-2 hover:bg-lavande-50 text-sm"
            >
              {p.prenoms} <span className="font-medium">{p.nom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
