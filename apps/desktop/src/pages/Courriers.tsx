import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const GABARITS = [
  { code: "adressage", libelle: "Adressement spécialiste" },
  { code: "compte_rendu", libelle: "Compte rendu de consultation" },
  { code: "certificat", libelle: "Certificat médical" },
];

export default function Courriers() {
  const [patientId, setPatientId] = useState("");
  const [gabarit, setGabarit] = useState(GABARITS[0].code);
  const [notes, setNotes] = useState("");
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [impressionEnCours, setImpressionEnCours] = useState(false);
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { utilisateur } = useAuth();
  const navigate = useNavigate();

  async function dossierGed() {
    const p = await import("@tauri-apps/api/path");
    return (await p.appDataDir()) + "ged";
  }

  async function imprimer() {
    if (!contenu) return;
    setImpressionEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      await api.imprimerCourrier(
        {
          praticien: `Dr ${utilisateur?.nom ?? ""} ${utilisateur?.prenoms ?? ""}`.trim(),
          cabinet: `${utilisateur?.cabinetNom ?? "Cabinet médical"} — ${utilisateur?.cabinetAdresse ?? ""}`.trim(),
          patient: patientId,
          destinataire: "Destinataire",
          objet: gabarit,
          corps: contenu,
          signature: "Signature",
        },
        await dossierGed(),
        true
      );
      setStatut("Courrier envoyé à l'imprimante (PDF archivé dans la GED)");
    } catch (e) {
      setErreur(String(e));
    } finally {
      setImpressionEnCours(false);
    }
  }

  async function archiver() {
    if (!contenu) return;
    setErreur(null);
    setStatut(null);
    try {
      const id = await api.importDocument({
        patientId: patientId || null,
        nomFichier: `courrier-${gabarit}.pdf`,
        chemin: await dossierGed(),
        typeDoc: "COURRIER",
      });
      setStatut(`Courrier archivé (${id.slice(0, 8)}…)`);
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function generer() {
    if (!patientId || !notes) return;
    setChargement(true);
    setErreur(null);
    try {
      const res = await api.genererCourrier({ patientId, gabarit, notes });
      setContenu(res.contenu);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Courriers — assistant IA</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              ID patient
            </label>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="UUID du patient"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Gabarit</label>
            <select
              value={gabarit}
              onChange={(e) => setGabarit(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              {GABARITS.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Notes de consultation
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="Motif, examen, conclusion…"
              className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <button
            onClick={generer}
            disabled={chargement || !patientId || !notes}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            {chargement ? "Génération…" : "✨ Générer le courrier"}
          </button>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-slate-500 mb-1">
            Courrier généré (modifiable)
          </label>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={22}
            className="flex-1 w-full border border-slate-300 rounded-lg p-4 bg-white font-serif focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Le brouillon IA apparaîtra ici…"
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={imprimer}
              disabled={!contenu || impressionEnCours}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40"
            >
              {impressionEnCours ? "⏳ Impression…" : "🖨️ Imprimer"}
            </button>
            <button
              onClick={archiver}
              disabled={!contenu}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            >
              📁 Archiver dans la GED
            </button>
          </div>
          {statut && <p className="text-sm text-emerald-600 mt-2">{statut}</p>}
        </div>
      </div>
      {erreur && <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>}
    </div>
  );
}
