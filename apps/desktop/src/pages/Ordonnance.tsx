import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, NouvellePrescription } from "../lib/api";
import { useNavigate as _nav } from "react-router-dom";
import { useAuth } from "../lib/auth";

type TypeOrdo = "SIMPLE" | "BI_ORDONNANCE" | "SECURISEE";

const LIGNE_VIDE: NouvellePrescription = {
  zone: "A",
  medicament: "",
  cip: null,
  posologie: "",
  duree: null,
  dureeJours: null,
  substitution: false,
  renouvellements: 0,
};

export default function Ordonnance() {
  const { id: patientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { utilisateur, token } = useAuth();

  const [type, setType] = useState<TypeOrdo>("SIMPLE");
  const [lignes, setLignes] = useState<NouvellePrescription[]>([{ ...LIGNE_VIDE }]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [statut, setStatut] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [propositions, setPropositions] = useState<NouvellePrescription[]>([]);
  const [propositionsEnCours, setPropositionsEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [nomPatient, setNomPatient] = useState("");

  useEffect(() => {
    if (patientId)
      api
        .getPatient(patientId, token!)
        .then((p) => setNomPatient(`${p.prenoms} ${p.nom}`))
        .catch(() => undefined);
  }, [patientId]);

  function majLigne(i: number, patch: Partial<NouvellePrescription>) {
    setLignes(lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function valider(): string | null {
    for (const l of lignes) {
      if (!l.medicament.trim()) return "chaque ligne exige un médicament";
      if (!l.posologie.trim()) return "chaque ligne exige une posologie";
    }
    if (type === "BI_ORDONNANCE" && !lignes.some((x) => x.zone === "B"))
      return "bi-ordonnance : au moins une ligne en zone B";
    return null;
  }

  function miseEnPage(): string {
    const zoneA = lignes.filter((l) => l.zone === "A");
    const zoneB = lignes.filter((l) => l.zone === "B");
    let texte = "";
    if (zoneA.length > 0) {
      texte += "PRESCRIPTIONS\n";
      zoneA.forEach((l) => {
        texte += `- ${l.medicament} : ${l.posologie}`;
        if (l.duree) texte += ` — durée : ${l.duree}`;
        if (l.renouvellements > 0) texte += ` — renouvelable ${l.renouvellements} fois`;
        if (l.substitution) texte += " — substitution possible";
        texte += "\n";
      });
    }
    if (zoneB.length > 0) {
      texte += "\nZONE B — à exécuter uniquement avec la partie A\n";
      zoneB.forEach((l) => {
        texte += `- ${l.medicament} : ${l.posologie}`;
        if (l.duree) texte += ` — durée : ${l.duree}`;
        texte += "\n";
      });
    }
    return texte;
  }

  async function proposerPrescription() {
    if (!description.trim()) return;
    setPropositionsEnCours(true);
    setErreur(null);
    try {
      const reponse = await api.assisterIa("ordonnance", description, token!);
      // Format attendu : « Médicament | posologie | durée » par ligne
      const lignes = reponse
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("|") && !l.toLowerCase().includes("valider"))
        .map((l) => {
          const [medicament, posologie, duree] = l.split("|").map((x) => x.trim());
          return { ...LIGNE_VIDE, medicament, posologie, duree: duree || null };
        });
      setPropositions(lignes);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setPropositionsEnCours(false);
    }
  }

  async function enregistrerEtImprimer() {
    if (!patientId) return;
    const probleme = valider();
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      const idOrdo = await api.creerOrdonnance(patientId, type, type === "SECURISEE", lignes, token!);
      const dossierGed = await import("@tauri-apps/api/path").then((p) =>
        p.appDataDir().then((d) => `${d}ged`)
      );
      await api.imprimerCourrier(
        {
          praticien: `Dr ${utilisateur?.nom ?? ""} ${utilisateur?.prenoms ?? ""}`.trim(),
          cabinet: `${utilisateur?.cabinetNom ?? ""} — ${utilisateur?.cabinetAdresse ?? ""}`.trim(),
          patient: nomPatient,
          destinataire: "Pharmacien",
          objet:
            type === "SECURISEE"
              ? "Ordonnance sécurisée"
              : type === "BI_ORDONNANCE"
                ? "Bi-ordonnance (zones A et B)"
                : "Ordonnance",
          corps: miseEnPage(),
          signature: `Dr ${utilisateur?.nom ?? ""}`,
        },
        dossierGed,
        true
      );
      setStatut(`Ordonnance ${idOrdo.slice(0, 8)}… enregistrée et imprimée (PDF archivé)`);
      setLignes([{ ...LIGNE_VIDE }]);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <button
        onClick={() => navigate(`/patients/${patientId}`)}
        className="text-sky-600 hover:underline text-sm mb-3"
      >
        ← Retour à la fiche patient
      </button>
      <h1 className="text-2xl font-bold mb-1">Ordonnance</h1>
      <p className="text-slate-500 mb-6">{nomPatient || "…"}</p>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm text-slate-500 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeOrdo)}
            className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="SIMPLE">Simple</option>
            <option value="BI_ORDONNANCE">Bi-ordonnance (A + B)</option>
            <option value="SECURISEE">Sécurisée (stupéfiants)</option>
          </select>
        </div>

        {type === "SECURISEE" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Ordonnance sécurisée (stupéfiants) : la sécurisation réglementaire
            complète (CPS, tampon, circuit FSV) sera branchée avec la
            facturation Vitale.
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left pb-2">Zone</th>
              <th className="text-left pb-2">Médicament *</th>
              <th className="text-left pb-2">Posologie *</th>
              <th className="text-left pb-2">Durée</th>
              <th className="text-left pb-2">Renv.</th>
              <th className="pb-2">Subst.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="pb-2 pr-2">
                  <select
                    value={l.zone}
                    onChange={(e) => majLigne(i, { zone: e.target.value })}
                    disabled={type !== "BI_ORDONNANCE"}
                    className="border border-slate-300 rounded px-2 py-1 bg-white disabled:opacity-40"
                  >
                    <option>A</option>
                    {type === "BI_ORDONNANCE" && <option>B</option>}
                  </select>
                </td>
                <td className="pb-2 pr-2">
                  <input
                    value={l.medicament}
                    onChange={(e) => majLigne(i, { medicament: e.target.value })}
                    placeholder="Médicament"
                    className="border border-slate-300 rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    value={l.posologie}
                    onChange={(e) => majLigne(i, { posologie: e.target.value })}
                    placeholder="1 cp matin"
                    className="border border-slate-300 rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    value={l.duree ?? ""}
                    onChange={(e) => majLigne(i, { duree: e.target.value || null })}
                    placeholder="7 jours"
                    className="border border-slate-300 rounded px-2 py-1 w-20"
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    value={l.renouvellements}
                    onChange={(e) =>
                      majLigne(i, {
                        renouvellements: parseInt(e.target.value.replace(/\D/g, "")) || 0,
                      })
                    }
                    className="border border-slate-300 rounded px-2 py-1 w-12"
                  />
                </td>
                <td className="pb-2 pr-2 text-center">
                  <input
                    type="checkbox"
                    checked={l.substitution}
                    onChange={(e) => majLigne(i, { substitution: e.target.checked })}
                  />
                </td>
                <td className="pb-2">
                  {lignes.length > 1 && (
                    <button
                      onClick={() => setLignes(lignes.filter((_, idx) => idx !== i))}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => setLignes([...lignes, { ...LIGNE_VIDE }])}
          className="text-sky-600 hover:underline text-sm"
        >
          + Ajouter une ligne
        </button>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="font-semibold text-sm mb-2">Assistant prescription</h3>
          <div className="flex gap-3">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrire la situation en une phrase (ex. « angine bactérienne, pas d'allergie »)"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={proposerPrescription}
              disabled={!description.trim() || propositionsEnCours}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40 text-sm whitespace-nowrap"
            >
              {propositionsEnCours ? "…" : "✨ Proposer"}
            </button>
          </div>
          {propositions.length > 0 && (
            <div className="mt-3 bg-white rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-xs text-slate-500">
                Suggestions IA — vérifiez et cliquez pour ajouter à l'ordonnance :
              </p>
              {propositions.map((l, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setLignes([...lignes, l]);
                    setPropositions(propositions.filter((_, j) => j !== i));
                  }}
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 text-sm border border-slate-100"
                >
                  ➕ {l.medicament} — {l.posologie}
                  {l.duree ? ` (${l.duree})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
        {statut && <p className="text-sm text-emerald-600">{statut}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={enregistrerEtImprimer}
            disabled={enCours}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            {enCours ? "Traitement…" : "💾 Enregistrer et imprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
