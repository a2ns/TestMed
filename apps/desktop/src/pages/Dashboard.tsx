import { useEffect, useState } from "react";
import { api, Stats } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .statistiques()
      .then(setStats)
      .catch((e) => setErreur(String(e)));
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Tableau de bord</h1>
      {erreur && (
        <p className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Base de données indisponible : {erreur}
        </p>
      )}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Carte titre="Patients" valeur={stats ? String(stats.patientsTotal) : "—"} />
        <Carte titre="Documents GED" valeur={stats ? String(stats.documentsTotal) : "—"} />
        <Carte
          titre="Courriers en brouillon"
          valeur={stats ? String(stats.courriersBrouillons) : "—"}
        />
        <Carte
          titre="Courriers validés"
          valeur={stats ? String(stats.courriersValides) : "—"}
        />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-semibold mb-2">Bienvenue dans MagicMed v2</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Refonte de MagicMed / MagicGed : client lourd Tauri (Rust), PostgreSQL
          central, GED avec import de documents, courriers assistés par IA
          (génération, reformulation, relecture).
        </p>
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
