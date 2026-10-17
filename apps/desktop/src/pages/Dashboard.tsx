import { useEffect, useState } from "react";
import { apiStats, Stats } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    apiStats
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
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Carte titre="Patients" valeur={stats ? String(stats.patientsTotal) : "—"} />
        <Carte
          titre="Consultations"
          valeur={stats ? String(stats.consultationsTotal) : "—"}
        />
        <Carte titre="Documents GED" valeur={stats ? String(stats.documentsTotal) : "—"} />
        <Carte
          titre="Courriers en brouillon"
          valeur={stats ? String(stats.courriersBrouillons) : "—"}
        />
        <Carte
          titre="Courriers validés"
          valeur={stats ? String(stats.courriersValides) : "—"}
        />
        {stats && stats.nonLies > 0 && (
          <Carte titre="Fiches non liées" valeur={String(stats.nonLies)} />
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-semibold mb-2">Bienvenue dans Primia</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Primia — client lourd Tauri (Rust), PostgreSQL central, GED avec scan
          de masse et OCR, courriers assistés par IA. Données migrées depuis
          MagicMed.
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
