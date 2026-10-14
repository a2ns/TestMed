import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, RendezVous } from "../lib/api";

function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Aujourdhui() {
  const navigate = useNavigate();
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const jour = dateLocale(new Date());

  useEffect(() => {
    api
      .listRdvJour(jour)
      .then(setRdvs)
      .catch((e) => setErreur(String(e)));
  }, [jour]);

  async function marquer(r: RendezVous, statut: string) {
    await api.changerStatutRdv(r.id, statut);
    setRdvs(await api.listRdvJour(jour));
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold">
          Aujourd'hui —{" "}
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h1>
        <button
          onClick={() => navigate("/agenda")}
          className="text-sky-600 hover:underline text-sm"
        >
          Voir l'agenda complet →
        </button>
      </div>

      {erreur && <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>}

      {rdvs.length === 0 && !erreur && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          Aucun rendez-vous aujourd'hui.
        </div>
      )}

      <div className="space-y-2">
        {rdvs.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-sky-300 transition"
          >
            <div className="text-lg font-bold text-sky-700 w-16 tabular-nums">
              {new Date(r.debut).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <button
              onClick={() => navigate(`/patients/${r.patientId}`)}
              className="flex-1 text-left"
            >
              <div className="font-semibold text-lg">
                {r.prenomsPatient} {r.nomPatient}
              </div>
              {r.motif && (
                <div className="text-sm text-slate-500">{r.motif}</div>
              )}
            </button>
            <span
              className={`text-xs font-bold px-2 py-1 rounded ${
                r.statut === "ARRIVE"
                  ? "bg-amber-100 text-amber-700"
                  : r.statut === "HONORE"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {r.statut}
            </span>
            <div className="flex gap-2">
              {r.statut === "PLANIFIE" && (
                <button
                  onClick={() => marquer(r, "ARRIVE")}
                  className="bg-emerald-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                >
                  Arrivé
                </button>
              )}
              {r.statut === "ARRIVE" && (
                <button
                  onClick={() => marquer(r, "HONORE")}
                  className="bg-sky-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-sky-700"
                >
                  Terminé
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
