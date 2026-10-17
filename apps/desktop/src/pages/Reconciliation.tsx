import { useEffect, useState } from "react";
import {
  apiReconciliation as api,
  FicheOrpheline,
  OccurrencePatient,
} from "../lib/api";

export default function Reconciliation() {
  const [fiches, setFiches] = useState<FicheOrpheline[]>([]);
  const [patients, setPatients] = useState<OccurrencePatient[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  async function rafraichir() {
    try {
      const [f, p] = await Promise.all([
        api.listFichesOrphelines(),
        api.listOccurrencesPatients(),
      ]);
      setFiches(f);
      setPatients(p);
    } catch (e) {
      setErreur(String(e));
    }
  }

  useEffect(() => {
    rafraichir();
  }, []);

  async function lier(fiche: FicheOrpheline) {
    const patientId = selection[fiche.id];
    if (!patientId) return;
    setErreur(null);
    setMessage(null);
    try {
      await api.lierFiche({ kind: fiche.kind, ficheId: fiche.id, patientId });
      setMessage(
        `${fiche.kind} lié${fiche.kind === "Consultation" ? "e" : ""} au patient avec succès`,
      );
      setSelection((prev) => ({ ...prev, [fiche.id]: "" }));
      await rafraichir();
    } catch (e) {
      setErreur(String(e));
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-2">Réconciliation des fiches</h1>
      <p className="text-sm text-slate-500 mb-6">
        Consultations et courriers migrés sans patient rattaché. Sélectionnez un
        patient pour rattacher une fiche orpheline. Aucune donnée n'a été perdue
        lors de la migration : les fiches non liées restent ici, rattachables à
        tout moment.
      </p>

      {erreur && (
        <p className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {erreur}
        </p>
      )}
      {message && (
        <p className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {message}
        </p>
      )}

      {fiches.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Aucune fiche orpheline — toutes les consultations et tous les
            courriers sont rattachés à un patient.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {fiches.map((f) => (
          <div
            key={f.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      f.kind === "Consultation"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {f.kind}
                  </span>
                  {f.date && (
                    <span className="text-xs text-slate-400">{f.date}</span>
                  )}
                </div>
                {f.sujet && (
                  <div className="font-medium text-sm text-slate-700 truncate">
                    {f.sujet}
                  </div>
                )}
                {f.extrait && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {f.extrait}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selection[f.id] || ""}
                  onChange={(e) =>
                    setSelection((prev) => ({ ...prev, [f.id]: e.target.value }))
                  }
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-48"
                >
                  <option value="">
                    {patients.length === 0
                      ? "Aucun patient récurrent disponible"
                      : "— Choisir un patient —"}
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} {p.prenoms} ({p.occurrences} fiches)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => lier(f)}
                  disabled={!selection[f.id]}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  Rattacher
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
