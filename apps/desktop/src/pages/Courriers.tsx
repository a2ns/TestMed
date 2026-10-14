import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import PatientPicker from "../components/PatientPicker";
import IndicateurIa from "../components/IndicateurIa";
import { Sparkles, FolderOpen } from "lucide-react";

// token exposé via useAuth pour les appels audités

const GABARITS = [
  { code: "adressage", libelle: "Adressement spécialiste" },
  { code: "compte_rendu", libelle: "Compte rendu de consultation" },
  { code: "certificat", libelle: "Certificat médical" },
];

export default function Courriers() {
  const [patientId, setPatientId] = useState("");
  const [patientNom, setPatientNom] = useState("");
  const [params] = useSearchParams();

  // Carnet de correspondants
  const [correspondants, setCorrespondants] = useState<
    { id: string; nom: string; specialite: string | null }[]
  >([]);
  const [destinataire, setDestinataire] = useState("");
  const [gabarit, setGabarit] = useState(GABARITS[0].code);

  function setPatient(id: string, nom: string) {
    setPatientId(id);
    setPatientNom(nom);
  }
  const [notes, setNotes] = useState("");
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [impressionEnCours, setImpressionEnCours] = useState(false);
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { utilisateur, token } = useAuth();

  // Carnet de correspondants
  useEffect(() => {
    api.listCorrespondants(token!).then(setCorrespondants).catch(() => undefined);
  }, [token]);

  // Pré-remplissage depuis la fiche patient (?patient=id)
  useEffect(() => {
    const p = params.get("patient");
    if (!p) return;
    setPatientId(p);
    api
      .getPatient(p, token!)
      .then((d) => setPatientNom(`${d.prenoms} ${d.nom}`))
      .catch(() => undefined);
  }, [params, token]);

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

  async function archiver() {
    if (!contenu) return;
    setImpressionEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      // 1. PDF mis en page, enregistré dans la GED (chemin retourné).
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
        await dossierGed(),
        false // pas d'envoi imprimante : archivage seul
      );
      // 2. Enregistrement en base, rattaché au patient, avec le texte
      //    pour la recherche plein texte (l'"OCR" du courrier = son contenu).
      if (patientId) {
        const id = await api.enregistrerCourrierGed(
          {
            patientId,
            nomFichier: `courrier-${gabarit}-${new Date().toISOString().slice(0, 10)}.pdf`,
            chemin: cheminPdf,
            contenu,
          },
          token!
        );
        setStatut(`Courrier archivé dans le dossier du patient (${id.slice(0, 8)}…) — visible dans son onglet Documents`);
      } else {
        setStatut("PDF généré — sélectionnez un patient pour l'archiver dans son dossier");
      }
    } catch (e) {
      setErreur(String(e));
    } finally {
      setImpressionEnCours(false);
    }
  }

  async function generer() {
    if (!patientId || !notes) return;
    setChargement(true);
    setErreur(null);
    try {
      const res = await api.genererCourrier({
        patientId,
        gabarit,
        notes,
        destinataire: destinataire || null,
        token: token!,
      });
      // Enrichit le carnet de correspondants (silencieux, dédupliqué).
      if (destinataire.trim()) {
        const morceaux = destinataire.split(",").map((x) => x.trim());
        api
          .creerCorrespondant(
            {
              nom: morceaux[0],
              specialite: morceaux[1] ?? null,
              adresse: null,
              email: null,
              telephone: null,
            },
            token!
          )
          .then(() =>
            api.listCorrespondants(token!).then(setCorrespondants)
          )
          .catch(() => undefined);
      }
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
            <PatientPicker
              patientId={patientId}
              patientNom={patientNom}
              onSelect={setPatient}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Destinataire (ex. « Dr Martin, urologue, CHU de … »)
            </label>
            <input
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              list="correspondants"
              placeholder="Dr Martin, cardiologue… (le carnet s'enrichit à chaque courrier)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            />
            <datalist id="correspondants">
              {correspondants.map((c) => (
                <option
                  key={c.id}
                  value={`${c.nom}${c.specialite ? `, ${c.specialite}` : ""}`}
                />
              ))}
            </datalist>
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
              className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-lavande-400"
            />
          </div>
          <button
            onClick={generer}
            disabled={chargement || !patientId || !notes}
            className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
          >
            {chargement ? "Génération…" : "Générer le courrier"}
          </button>
          <IndicateurIa actif={chargement} tache="courrier" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-slate-500 mb-1">
            Courrier généré (modifiable)
          </label>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={22}
            className="flex-1 w-full border border-slate-300 rounded-lg p-4 bg-white font-serif focus:outline-none focus:ring-2 focus:ring-lavande-400"
            placeholder="Le brouillon IA apparaîtra ici…"
          />
          <IndicateurIa actif={chargement && !contenu} tache="reformulation" />
          <div className="flex gap-3 mt-3 flex-wrap">
            <button
              onClick={reformuler}
              disabled={!contenu || chargement}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100 disabled:opacity-40 text-sm"
              title="Améliore la clarté et le style sans changer le sens médical"
            >
              <Sparkles size={14} className="inline" /> Reformuler
            </button>
            <button
              onClick={imprimer}
              disabled={!contenu || impressionEnCours}
              className="bg-nuit-950 text-white px-4 py-2 rounded-lg hover:bg-nuit-700 disabled:opacity-40"
            >
              {impressionEnCours ? "Impression…" : "Imprimer"}
            </button>
            <button
              onClick={archiver}
              disabled={!contenu}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100 disabled:opacity-40"
            >
              <FolderOpen size={15} className="inline" /> Archiver dans la GED
            </button>
          </div>
          {statut && <p className="text-sm text-emerald-600 mt-2">{statut}</p>}
        </div>
      </div>
      {erreur && <p className="mt-4 text-sm text-red-600">Erreur : {erreur}</p>}
    </div>
  );
}
