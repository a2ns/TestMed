import { useEffect, useState } from "react";
import { api, EntreeAudit } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Journal() {
  const { token, utilisateur } = useAuth();
  const [entrees, setEntrees] = useState<EntreeAudit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");

  useEffect(() => {
    api
      .listAuditLog(token!, 200)
      .then(setEntrees)
      .catch((e) => setErreur(String(e)));
  }, [token]);

  if (utilisateur?.role !== "ADMIN") {
    return (
      <div className="p-8">
        <p className="text-red-600">Consultation du journal réservée au rôle ADMIN.</p>
      </div>
    );
  }

  const visibles = entrees.filter(
    (e) =>
      !filtre ||
      e.action.toLowerCase().includes(filtre.toLowerCase()) ||
      e.userId.toLowerCase().includes(filtre.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Journal d'audit</h1>
      <input
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        placeholder="Filtrer par action ou utilisateur…"
        className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 bg-white mb-4"
      />
      {erreur && <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>}
      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
        <thead className="bg-nuit-100 text-slate-500">
          <tr>
            <th className="px-4 py-3">Horodatage</th>
            <th className="px-4 py-3">Utilisateur</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Cible</th>
            <th className="px-4 py-3">Détail</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((e) => (
            <tr key={e.id} className="border-t border-nuit-100">
              <td className="px-4 py-2 whitespace-nowrap">
                {new Date(e.ts).toLocaleString("fr-FR")}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{e.userId.slice(0, 8)}…</td>
              <td className="px-4 py-2">
                <span
                  className={`font-medium ${
                    e.action.includes("ECHEC") ? "text-red-600" : "text-slate-800"
                  }`}
                >
                  {e.action}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {e.cibleType ? `${e.cibleType} ${e.cibleId?.slice(0, 8)}…` : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-slate-400 max-w-xs truncate">
                {e.detail ? JSON.stringify(e.detail) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
