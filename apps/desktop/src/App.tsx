import { useState } from "react";

type View = "dashboard" | "patients" | "ged" | "courriers";

const MENU: { id: View; label: string; icone: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icone: "📊" },
  { id: "patients", label: "Patients", icone: "👤" },
  { id: "ged", label: "GED", icone: "🗂️" },
  { id: "courriers", label: "Courriers", icone: "✉️" },
];

export default function App() {
  const [vue, setVue] = useState<View>("dashboard");

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-5 text-xl font-bold text-white">MagicMed</div>
        <nav className="flex-1 px-3 space-y-1">
          {MENU.map((m) => (
            <button
              key={m.id}
              onClick={() => setVue(m.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${
                vue === m.id
                  ? "bg-slate-700 text-white font-medium"
                  : "hover:bg-slate-800"
              }`}
            >
              <span>{m.icone}</span> {m.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-slate-400">v0.1.0 — refonte</div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {vue === "dashboard" && <Dashboard />}
        {vue === "patients" && <Patients />}
        {vue === "ged" && <Ged />}
        {vue === "courriers" && <Courriers />}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-3 gap-4">
        <Carte titre="Patients aujourd'hui" valeur="—" />
        <Carte titre="Documents non classés" valeur="—" />
        <Carte titre="Courriers en attente" valeur="—" />
      </div>
    </div>
  );
}

function Carte({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500">{titre}</div>
      <div className="text-3xl font-bold mt-2">{valeur}</div>
    </div>
  );
}

function Patients() {
  const [recherche, setRecherche] = useState("");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Patients</h1>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un patient…"
        className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      <p className="mt-4 text-slate-500 text-sm">
        Recherche : {recherche || "—"} (connexion PostgreSQL à brancher)
      </p>
    </div>
  );
}

function Ged() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">GED — MagicGed</h1>
      <div className="flex gap-3">
        <button className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700">
          📄 Scanner en masse
        </button>
        <button className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100">
          📥 Importer
        </button>
      </div>
      <p className="mt-4 text-slate-500 text-sm">
        Scan TWAIN/SANE + OCR Tesseract à brancher (core Rust).
      </p>
    </div>
  );
}

function Courriers() {
  const [notes, setNotes] = useState("");
  const [resultat, setResultat] = useState("");
  const [chargement, setChargement] = useState(false);

  async function generer() {
    setChargement(true);
    setResultat("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<{ contenu: string }>("generer_courrier_ia", {
        req: { patientId: "…", gabarit: "adressage", notes },
      });
      setResultat(res.contenu);
    } catch (e) {
      setResultat(String(e));
    } finally {
      setChargement(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Courriers — assistant IA</h1>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-sm text-slate-500">Notes de consultation</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            className="mt-1 w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Motif, examen, conclusion…"
          />
          <button
            onClick={generer}
            disabled={chargement || !notes}
            className="mt-3 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40"
          >
            {chargement ? "Génération…" : "✨ Générer le courrier"}
          </button>
        </div>
        <div>
          <label className="text-sm text-slate-500">Courrier généré</label>
          <div className="mt-1 w-full h-72 border border-slate-300 rounded-lg p-3 bg-white overflow-auto whitespace-pre-wrap">
            {resultat || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
