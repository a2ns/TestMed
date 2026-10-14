import { useEffect, useMemo, useState } from "react";
import { api, CourrierRow, Patient } from "../lib/api";

const GABARITS = [
  {
    code: "adressage",
    libelle: "Adressement spécialiste",
    contenu:
      "Docteur,\n\nJe vous adresse Madame/Monsieur [Nom] pour [motif d'adressage].\n\n[Examen clinique et antécédents pertinents]\n\nJe vous remercie de bien vouloir prendre en charge ce/tte patient(e) et reste à votre disposition pour tout complément d'information.\n\nVeuillez agréer, Docteur, l'expression de mes sentiments les meilleurs.",
  },
  {
    code: "compte_rendu",
    libelle: "Compte rendu de consultation",
    contenu:
      "Compte rendu de consultation du [date].\n\nMotif : [motif]\n\nHistorique :\n[antécédents]\n\nExamen clinique :\n[examen]\n\nConclusion :\n[conclusion]\n\nConduite à tenir :\n[traitement et suivi]",
  },
  {
    code: "certificat",
    libelle: "Certificat médical",
    contenu:
      "Je soussigné(e), Docteur [Nom du praticien], certifie avoir examiné ce jour Madame/Monsieur [Nom].\n\n[Observations]\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.",
  },
];

export default function Courriers() {
  const [recherche, setRecherche] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [gabarit, setGabarit] = useState(GABARITS[0].code);
  const [notes, setNotes] = useState("");
  const [sujet, setSujet] = useState("");
  const [contenu, setContenu] = useState("");
  const [consigne, setConsigne] = useState("");
  const [relecture, setRelecture] = useState<string | null>(null);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [courriers, setCourriers] = useState<CourrierRow[]>([]);
  const [modifie, setModifie] = useState(false);

  const gabaritSelectionne = useMemo(
    () => GABARITS.find((g) => g.code === gabarit),
    [gabarit]
  );

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setPatients([]);
      return;
    }
    api
      .listPatients(recherche)
      .then(setPatients)
      .catch(() => setPatients([]));
  }, [recherche]);

  async function rafraichirCourriers(patientId: string | null) {
    try {
      setCourriers(await api.listCourriers(patientId));
    } catch {
      setCourriers([]);
    }
  }

  useEffect(() => {
    rafraichirCourriers(patient?.id ?? null);
  }, [patient?.id]);

  async function action(nom: string, fn: () => Promise<void>) {
    setChargement(nom);
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setChargement(null);
    }
  }

  function generer() {
    if (!patient) return;
    action("generation", async () => {
      const res = await api.genererCourrier({
        patientId: patient.id,
        gabarit: gabaritSelectionne?.contenu ?? "",
        notes,
      });
      setContenu(res.contenu);
      setSujet(sujet || gabaritSelectionne?.libelle || "");
      setModifie(false);
    });
  }

  function reformuler() {
    if (!patient || !contenu || !consigne) return;
    action("reformulation", async () => {
      const res = await api.reformulerCourrier({
        patientId: patient.id,
        contenu,
        consigne,
      });
      setContenu(res.contenu);
      setModifie(false);
    });
  }

  function relire() {
    if (!contenu) return;
    action("relecture", async () => {
      const res = await api.relireCourrier(contenu);
      setRelecture(res.contenu);
    });
  }

  function enregistrer(valide: boolean) {
    if (!patient || !contenu) return;
    action("enregistrement", async () => {
      const row = await api.enregistrerCourrier({
        patientId: patient.id,
        sujet: sujet || null,
        contenu,
        aiGenere: true,
        valide,
      });
      setCourriers((prev) => [row, ...prev]);
    });
  }

  function imprimer() {
    const fenetre = window.open("", "_blank", "width=800,height=900");
    if (!fenetre) return;
    fenetre.document.write(
      `<html><head><title>${sujet || "Courrier"}</title></head>
       <body style="font-family: Georgia, serif; white-space: pre-wrap; padding: 2cm;">
       ${contenu.replace(/</g, "&lt;")}
       </body></html>`
    );
    fenetre.document.close();
    fenetre.print();
  }

  const occupe = chargement !== null;

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Courriers — assistant IA</h1>

      {erreur && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {erreur}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Patient</label>
            {patient ? (
              <div className="flex items-center justify-between border border-slate-300 rounded-lg px-3 py-2 bg-white">
                <span className="font-medium">
                  {patient.prenoms} {patient.nom}
                </span>
                <button
                  onClick={() => {
                    setPatient(null);
                    setContenu("");
                    setRelecture(null);
                  }}
                  className="text-xs text-sky-600 hover:underline"
                >
                  Changer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  autoFocus
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un patient (nom, prénom)…"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                {patients.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {patients.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => setPatient(p)}
                          className="w-full text-left px-3 py-2 hover:bg-sky-50"
                        >
                          {p.prenoms} {p.nom}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
              rows={8}
              placeholder="Motif, examen, conclusion…"
              className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <button
            onClick={generer}
            disabled={occupe || !patient || !notes}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            {chargement === "generation"
              ? "Génération…"
              : "✨ Générer le courrier"}
          </button>

          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Instruction de modification (reformulation IA)
            </label>
            <div className="flex gap-2">
              <input
                value={consigne}
                onChange={(e) => setConsigne(e.target.value)}
                placeholder="Ex. : plus court, ton plus formel…"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 bg-white"
              />
              <button
                onClick={reformuler}
                disabled={occupe || !patient || !contenu || !consigne}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap"
              >
                {chargement === "reformulation" ? "Reformulation…" : "↻ Reformuler"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-slate-500">
              Courrier {modifie && <span className="text-amber-600">(modifié)</span>}
            </label>
            <button
              onClick={relire}
              disabled={occupe || !contenu}
              className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-lg hover:bg-amber-200 disabled:opacity-40"
            >
              {chargement === "relecture" ? "Relecture…" : "🔍 Relecture IA"}
            </button>
          </div>
          <input
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            placeholder="Sujet du courrier"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white mb-2 text-sm"
          />
          <textarea
            value={contenu}
            onChange={(e) => {
              setContenu(e.target.value);
              setModifie(true);
            }}
            rows={18}
            className="flex-1 w-full border border-slate-300 rounded-lg p-4 bg-white font-serif focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Le brouillon IA apparaîtra ici…"
          />
          {relecture && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 whitespace-pre-wrap">
              <span className="font-semibold">Relecture IA : </span>
              {relecture}
            </div>
          )}
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => enregistrer(false)}
              disabled={occupe || !patient || !contenu}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            >
              {chargement === "enregistrement" ? "Enregistrement…" : "💾 Brouillon"}
            </button>
            <button
              onClick={() => enregistrer(true)}
              disabled={occupe || !patient || !contenu}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
            >
              ✓ Valider et archiver
            </button>
            <button
              onClick={imprimer}
              disabled={!contenu}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40"
            >
              🖨️ Imprimer
            </button>
          </div>
        </div>
      </div>

      {patient && courriers.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">
            Courriers de {patient.prenoms} {patient.nom}
          </h2>
          <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
            <thead className="bg-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Sujet</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">IA</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {courriers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-sky-50">
                  <td className="px-4 py-2">
                    {new Date(c.date).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-2">{c.sujet || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        c.statut === "VALIDE"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.statut}
                    </span>
                  </td>
                  <td className="px-4 py-2">{c.aiGenere ? "✨" : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {c.statut !== "VALIDE" && (
                      <button
                        onClick={() =>
                          action("validation", async () => {
                            await api.validerCourrier(c.id);
                            setCourriers((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, statut: "VALIDE" } : x
                              )
                            );
                          })
                        }
                        className="text-xs text-sky-600 hover:underline"
                      >
                        Valider
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
