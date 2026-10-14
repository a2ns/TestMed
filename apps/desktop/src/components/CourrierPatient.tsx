import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const GABARITS = [
  { code: "adressage", libelle: "Adressement spécialiste" },
  { code: "compte_rendu", libelle: "Compte rendu de consultation" },
  { code: "certificat", libelle: "Certificat médical" },
];

type Props = {
  patientId: string;
  patientNom: string;
  onFerme: () => void;
  onArchive: () => void; // rafraîchir l'onglet documents
};

/// Module courrier intégré au dossier patient : patient verrouillé,
/// génération IA, relecture, impression et archivage GED direct.
export default function CourrierPatient({
  patientId,
  patientNom,
  onFerme,
  onArchive,
}: Props) {
  const { utilisateur, token } = useAuth();
  const [gabarit, setGabarit] = useState(GABARITS[0].code);
  const [destinataire, setDestinataire] = useState("");
  const [notes, setNotes] = useState("");
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [impressionEnCours, setImpressionEnCours] = useState(false);
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function generer() {
    if (!notes) return;
    setChargement(true);
    setErreur(null);
    setStatut(null);
    try {
      const res = await api.genererCourrier({
        patientId,
        gabarit,
        notes,
        destinataire: destinataire || null,
        token: token!,
      });
      setContenu(res.contenu);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setChargement(false);
    }
  }

  async function reformuler() {
    if (!contenu) return;
    setChargement(true);
    setErreur(null);
    try {
      const ameliore = await api.reformulerTexte(
        contenu,
        "Rends ce courrier plus clair et professionnel, sans rien changer au fond médical.",
        token!
      );
      setContenu(ameliore);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setChargement(false);
    }
  }

  async function archiverEtImprimer() {
    if (!contenu) return;
    setImpressionEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      // PDF mis en page dans la GED, avec les coordonnées de la fiche praticien.
      const dossierGed = await import("@tauri-apps/api/path").then((p) =>
        p.appDataDir().then((d) => `${d}ged`)
      );
      const cheminPdf = await api.imprimerCourrier(
        {
          praticien: `Dr ${utilisateur?.prenoms ?? ""} ${utilisateur?.nom ?? ""}`.trim(),
          cabinet: `${utilisateur?.cabinetNom ?? ""}\n${utilisateur?.cabinetAdresse ?? ""}\n${utilisateur?.telephone ?? ""}`.trim(),
          patient: patientNom,
          destinataire: destinataire || "Cher Confrère",
          objet: `Courrier — ${gabarit}`,
          corps: contenu,
          signature: `Dr ${utilisateur?.nom ?? ""}`,
        },
        dossierGed,
        true // envoi imprimante + archivage
      );
      // Enregistrement lié au patient, texte indexé (recherche plein texte).
      await api.enregistrerCourrierGed(
        {
          patientId,
          nomFichier: `courrier-${gabarit}-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf`,
          chemin: cheminPdf,
          contenu,
        },
        token!
      );
      onArchive();
      setStatut(
        "Courrier imprimé et archivé dans le dossier du patient (onglet documents)"
      );
    } catch (e) {
      setErreur(String(e));
    } finally {
      setImpressionEnCours(false);
    }
  }

  async function archiverSeul() {
    if (!contenu) return;
    setImpressionEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      const dossierGed = await import("@tauri-apps/api/path").then((p) =>
        p.appDataDir().then((d) => `${d}ged`)
      );
      const cheminPdf = await api.imprimerCourrier(
        {
          praticien: `Dr ${utilisateur?.prenoms ?? ""} ${utilisateur?.nom ?? ""}`.trim(),
          cabinet: `${utilisateur?.cabinetNom ?? ""}\n${utilisateur?.cabinetAdresse ?? ""}\n${utilisateur?.telephone ?? ""}`.trim(),
          patient: patientNom,
          destinataire: destinataire || "Cher Confrère",
          objet: `Courrier — ${gabarit}`,
          corps: contenu,
          signature: `Dr ${utilisateur?.nom ?? ""}`,
        },
        dossierGed,
        false // archivage seul
      );
      await api.enregistrerCourrierGed(
        {
          patientId,
          nomFichier: `courrier-${gabarit}-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf`,
          chemin: cheminPdf,
          contenu,
        },
        token!
      );
      onArchive();
      setStatut("Courrier archivé dans le dossier du patient");
    } catch (e) {
      setErreur(String(e));
    } finally {
      setImpressionEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-nuit-950/50 z-40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            ✉️ Courrier — {patientNom}
          </h2>
          <button
            onClick={onFerme}
            className="text-slate-400 hover:text-slate-700 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Saisie */}
          <div className="space-y-3">
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
                Destinataire (carnet)
              </label>
              <input
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
                placeholder="Dr Martin, cardiologue…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Notes de consultation
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                placeholder="Motif, examen, conclusion…"
                className="w-full border border-slate-300 rounded-lg p-3"
              />
            </div>
            <button
              onClick={generer}
              disabled={chargement || !notes}
              className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40 w-full"
            >
              {chargement ? "Génération…" : "✨ Générer le courrier"}
            </button>
          </div>

          {/* Aperçu */}
          <div className="flex flex-col">
            <label className="block text-sm text-slate-500 mb-1">
              Courrier (modifiable)
            </label>
            <textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={18}
              className="flex-1 w-full border border-slate-300 rounded-lg p-4 font-serif focus:outline-none focus:ring-2 focus:ring-lavande-400"
              placeholder="Le brouillon IA apparaîtra ici…"
            />
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={reformuler}
                disabled={!contenu || chargement}
                className="bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-nuit-100 disabled:opacity-40 text-sm"
              >
                ✨ Reformuler
              </button>
              <button
                onClick={archiverSeul}
                disabled={!contenu || impressionEnCours}
                className="bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-nuit-100 disabled:opacity-40 text-sm"
              >
                📁 Archiver
              </button>
              <button
                onClick={archiverEtImprimer}
                disabled={!contenu || impressionEnCours}
                className="bg-nuit-950 text-white px-4 py-2 rounded-lg hover:bg-nuit-700 disabled:opacity-40 text-sm"
              >
                {impressionEnCours ? "…" : "🖨️ Imprimer + archiver"}
              </button>
            </div>
          </div>
        </div>

        {statut && (
          <p className="text-sm text-emerald-600 mt-4">{statut}</p>
        )}
        {erreur && (
          <p className="text-sm text-red-600 mt-4">Erreur : {erreur}</p>
        )}
      </div>
    </div>
  );
}
