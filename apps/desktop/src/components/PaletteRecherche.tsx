import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Patient } from "../lib/api";

/// Palette de recherche globale : Ctrl+K (ou ⌘K) depuis n'importe où.
export default function PaletteRecherche() {
  const navigate = useNavigate();
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Patient[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuverte((o) => !o);
      }
      if (e.key === "Escape") setOuverte(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (ouverte) {
      setRecherche("");
      setResultats([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [ouverte]);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .listPatients(recherche)
        .then(setResultats)
        .catch(() => setResultats([]));
    }, 150);
    return () => clearTimeout(t);
  }, [recherche]);

  function choisir(p: Patient) {
    setOuverte(false);
    navigate(`/patients/${p.id}`);
  }

  if (!ouverte) return null;

  return (
    <div
      className="fixed inset-0 bg-nuit-950/40 z-50 flex items-start justify-center pt-24"
      onClick={() => setOuverte(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && resultats.length > 0) choisir(resultats[0]);
          }}
          placeholder="Nom du patient… (Entrée = ouvrir le premier résultat)"
          className="w-full text-lg px-5 py-4 border-b border-slate-200 focus:outline-none"
        />
        <div className="max-h-80 overflow-auto divide-y">
          {resultats.map((p) => (
            <button
              key={p.id}
              onClick={() => choisir(p)}
              className="w-full text-left px-5 py-3 hover:bg-lavande-50 flex justify-between items-center"
            >
              <span className="font-medium">
                {p.prenoms} {p.nom}
              </span>
              <span className="text-xs text-slate-400">Ouvrir le dossier ↵</span>
            </button>
          ))}
          {recherche.length >= 2 && resultats.length === 0 && (
            <p className="px-5 py-4 text-sm text-slate-400">Aucun patient trouvé.</p>
          )}
        </div>
      </div>
    </div>
  );
}
