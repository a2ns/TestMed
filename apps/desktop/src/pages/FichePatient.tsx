import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, Antecedent, Allergie, Consultation, Traitement } from "../lib/api";

type Onglet = "consultations" | "antecedents" | "traitements" | "allergies";

const CATEGORIES = ["MEDICAL", "CHIRURGICAL", "FAMILIAL", "OBSTETRIQUE", "TOXIQUE"];
const GRAVITES = ["SEVERE", "MODEREE", "FAIBLE"];

export default function FichePatient() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<Onglet>("consultations");

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [antecedents, setAntecedents] = useState<Antecedent[]>([]);
  const [traitements, setTraitements] = useState<Traitement[]>([]);
  const [allergies, setAllergies] = useState<Allergie[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nomPatient, setNomPatient] = useState("");

  useEffect(() => {
    if (!id) return;
    setErreur(null);
    api.getPatient(id).then((p) => setNomPatient(`${p.prenoms} ${p.nom}`)).catch((e) => setErreur(String(e)));
    api.listConsultations(id).then(setConsultations).catch((e) => setErreur(String(e)));
    api.listAntecedents(id).then(setAntecedents).catch((e) => setErreur(String(e)));
    api.listTraitements(id).then(setTraitements).catch((e) => setErreur(String(e)));
    api.listAllergies(id).then(setAllergies).catch((e) => setErreur(String(e)));
  }, [id]);

  async function ajouterConsultation(motif: string, notes: string) {
    if (!id) return;
    await api.creerConsultation(id, motif, notes);
    setConsultations(await api.listConsultations(id));
  }
  async function ajouterAntecedent(cat: string, lib: string, annee: number | null) {
    if (!id) return;
    await api.creerAntecedent(id, cat, lib, annee, null);
    setAntecedents(await api.listAntecedents(id));
  }
  async function ajouterTraitement(med: string, poso: string, duree: string | null) {
    if (!id) return;
    await api.creerTraitement(id, med, poso, duree);
    setTraitements(await api.listTraitements(id));
  }
  async function ajouterAllergie(sub: string, grav: string) {
    if (!id) return;
    await api.creerAllergie(id, sub, grav, null);
    setAllergies(await api.listAllergies(id));
  }

  return (
    <div className="p-8 max-w-6xl">
      <button
        onClick={() => navigate("/patients")}
        className="text-sky-600 hover:underline text-sm mb-3"
      >
        ← Retour à la recherche
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{nomPatient || "…"}</h1>
        <div className="flex gap-3 items-center">
          {allergies.length > 0 && (
            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
              ⚠ {allergies.length} allergie(s)
            </span>
          )}
          <button
            onClick={() => navigate(`/patients/${id}/ordonnance`)}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 text-sm"
          >
            📝 Ordonnance
          </button>
        </div>
      </div>
      {erreur && <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>}

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {(["consultations", "antecedents", "traitements", "allergies"] as Onglet[]).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={`px-4 py-2 text-sm capitalize rounded-t-lg ${
              onglet === o
                ? "bg-white border-x border-t border-slate-200 font-semibold -mb-px"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o}
          </button>
        ))}
      </div>

      {onglet === "consultations" && (
        <SectionConsultations
          consultations={consultations}
          ajouter={ajouterConsultation}
        />
      )}
      {onglet === "antecedents" && (
        <SectionAntecedents
          antecedents={antecedents}
          ajouter={ajouterAntecedent}
        />
      )}
      {onglet === "traitements" && (
        <SectionTraitements traitements={traitements} ajouter={ajouterTraitement} />
      )}
      {onglet === "allergies" && (
        <SectionAllergies allergies={allergies} ajouter={ajouterAllergie} />
      )}
    </div>
  );
}

function SectionConsultations({
  consultations,
  ajouter,
}: {
  consultations: Consultation[];
  ajouter: (motif: string, notes: string) => Promise<void>;
}) {
  const [motif, setMotif] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold">Nouvelle consultation</h2>
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Motif (obligatoire)"
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Notes : examen, diagnostic, conduite à tenir…"
          className="w-full border border-slate-300 rounded-lg p-3"
        />
        <button
          onClick={() => ajouter(motif, notes).then(() => { setMotif(""); setNotes(""); })}
          disabled={!motif}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
      {consultations.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex justify-between">
            <span className="font-semibold">{c.motif}</span>
            <span className="text-sm text-slate-500">
              {new Date(c.date).toLocaleString("fr-FR")}
            </span>
          </div>
          {c.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{c.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function SectionAntecedents({
  antecedents,
  ajouter,
}: {
  antecedents: Antecedent[];
  ajouter: (cat: string, lib: string, annee: number | null) => Promise<void>;
}) {
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [lib, setLib] = useState("");
  const [annee, setAnnee] = useState("");
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold">Ajouter un antécédent</h2>
        <div className="flex gap-3">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={lib}
            onChange={(e) => setLib(e.target.value)}
            placeholder="Libellé (obligatoire)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            value={annee}
            onChange={(e) => setAnnee(e.target.value.replace(/\D/g, ""))}
            placeholder="Année"
            className="w-24 border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          onClick={() =>
            ajouter(cat, lib, annee ? parseInt(annee) : null).then(() => { setLib(""); setAnnee(""); })
          }
          disabled={!lib}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
        <thead className="bg-slate-100 text-slate-500">
          <tr>
            <th className="px-4 py-2">Catégorie</th>
            <th className="px-4 py-2">Libellé</th>
            <th className="px-4 py-2">Année</th>
          </tr>
        </thead>
        <tbody>
          {antecedents.map((a) => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{a.categorie}</td>
              <td className="px-4 py-2">{a.libelle}</td>
              <td className="px-4 py-2">{a.annee ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTraitements({
  traitements,
  ajouter,
}: {
  traitements: Traitement[];
  ajouter: (med: string, poso: string, duree: string | null) => Promise<void>;
}) {
  const [med, setMed] = useState("");
  const [poso, setPoso] = useState("");
  const [duree, setDuree] = useState("");
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold">Ajouter un traitement</h2>
        <div className="flex gap-3">
          <input
            value={med}
            onChange={(e) => setMed(e.target.value)}
            placeholder="Médicament (obligatoire)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            value={poso}
            onChange={(e) => setPoso(e.target.value)}
            placeholder="Posologie"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
            placeholder="Durée"
            className="w-32 border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          onClick={() =>
            ajouter(med, poso, duree || null).then(() => { setMed(""); setPoso(""); setDuree(""); })
          }
          disabled={!med}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
        <thead className="bg-slate-100 text-slate-500">
          <tr>
            <th className="px-4 py-2">Médicament</th>
            <th className="px-4 py-2">Posologie</th>
            <th className="px-4 py-2">Durée</th>
            <th className="px-4 py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {traitements.map((t) => (
            <tr key={t.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">{t.medicament}</td>
              <td className="px-4 py-2">{t.posologie}</td>
              <td className="px-4 py-2">{t.duree ?? "—"}</td>
              <td className="px-4 py-2">
                {t.actif ? (
                  <span className="text-emerald-600">en cours</span>
                ) : (
                  <span className="text-slate-400">arrêté</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionAllergies({
  allergies,
  ajouter,
}: {
  allergies: Allergie[];
  ajouter: (sub: string, grav: string) => Promise<void>;
}) {
  const [sub, setSub] = useState("");
  const [grav, setGrav] = useState(GRAVITES[1]);
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold">Déclarer une allergie</h2>
        <div className="flex gap-3">
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            placeholder="Substance (obligatoire)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
          />
          <select
            value={grav}
            onChange={(e) => setGrav(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {GRAVITES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => ajouter(sub, grav).then(() => setSub(""))}
          disabled={!sub}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      <div className="grid gap-3">
        {allergies.map((a) => (
          <div
            key={a.id}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between"
          >
            <span className="font-medium">{a.substance}</span>
            <span
              className={`text-xs font-bold px-2 py-1 rounded ${
                a.gravite === "SEVERE"
                  ? "bg-red-100 text-red-700"
                  : a.gravite === "MODEREE"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {a.gravite}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
