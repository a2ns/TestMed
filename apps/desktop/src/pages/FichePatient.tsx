import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  api,
  Antecedent,
  Allergie,
  Consultation,
  Traitement,
  ResultatDocument,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import CourrierPatient from "../components/CourrierPatient";

type Onglet = "consultations" | "antecedents" | "traitements" | "allergies" | "documents";

const CATEGORIES = ["MEDICAL", "CHIRURGICAL", "FAMILIAL", "OBSTETRIQUE", "TOXIQUE"];
const GRAVITES = ["SEVERE", "MODEREE", "FAIBLE"];

/// Fiche patient repensée pour la consultation (médecin, 15 min/patient) :
/// synthèse permanente à gauche, actions rapides en haut, onglets à droite.
export default function FichePatient() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>("consultations");
  const [courrierOuvert, setCourrierOuvert] = useState(false);
  const [cleDocuments, setCleDocuments] = useState(0);

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [antecedents, setAntecedents] = useState<Antecedent[]>([]);
  const [traitements, setTraitements] = useState<Traitement[]>([]);
  const [allergies, setAllergies] = useState<Allergie[]>([]);
  const [constantes, setConstantes] = useState<
    { id: string; type: string; valeur: string; unite: string | null; date: string }[]
  >([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [identite, setIdentite] = useState<{
    nom: string;
    prenoms: string;
    dateNaissance: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setErreur(null);
    Promise.all([
      api.getPatient(id, token!),
      api.listConsultations(id),
      api.listAntecedents(id),
      api.listTraitements(id),
      api.listAllergies(id),
      api.listConstantes(id, token!),
    ])
      .then(([p, c, a, t, al, cb]) => {
        setIdentite({ nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance });
        setConsultations(c);
        setAntecedents(a);
        setTraitements(t);
        setAllergies(al);
        setConstantes(cb);
      })
      .catch((e) => setErreur(String(e)));
  }, [id, token]);

  async function ajouterConsultation(motif: string, notes: string) {
    if (!id) return;
    await api.creerConsultation(id, motif, notes);
    setConsultations(await api.listConsultations(id));
  }

  async function structurerNotes(
    motif: string,
    notes: string
  ): Promise<{ motif: string; notes: string } | null> {
    if (!notes.trim()) return null;
    try {
      const structure = await api.assisterIa("consultation", notes, null, token!);
      return { motif, notes: structure };
    } catch (e) {
      setErreur(String(e));
      return null;
    }
  }

  async function supprimerUneConsultation(idCons: string) {
    await api.supprimerConsultation(idCons, token!);
    if (id) setConsultations(await api.listConsultations(id));
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

  const age = identite?.dateNaissance
    ? `${Math.floor(
        (Date.now() - new Date(identite.dateNaissance).getTime()) /
          (365.25 * 24 * 3600 * 1000)
      )} ans`
    : "";

  const traitementsActifs = traitements.filter((t) => t.actif);
  const derniereConsultation = consultations[0];

  return (
    <div className="flex h-full">
      {/* Colonne gauche : synthèse permanente */}
      <aside className="w-80 border-r border-slate-200 bg-white overflow-auto p-5 space-y-5 shrink-0">
        <div>
          <button
            onClick={() => navigate("/patients")}
            className="text-xs text-slate-400 hover:text-slate-600 mb-2"
          >
            ← Recherche
          </button>
          <h1 className="text-xl font-bold">
            {identite ? `${identite.prenoms} ${identite.nom}` : "…"}
          </h1>
          <p className="text-sm text-slate-500">
            {age}
            {identite?.dateNaissance
              ? ` — né(e) le ${new Date(identite.dateNaissance).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
        </div>

        {allergies.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <h2 className="text-xs font-bold text-red-700 uppercase mb-1">
              ⚠ Allergies
            </h2>
            {allergies.map((a) => (
              <div key={a.id} className="text-sm text-red-800 font-medium">
                {a.substance}
                <span className="text-xs font-normal text-red-500 ml-1">
                  {a.gravite}
                </span>
              </div>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase mb-2">
            Traitements en cours ({traitementsActifs.length})
          </h2>
          {traitementsActifs.length === 0 && (
            <p className="text-sm text-slate-400">Aucun</p>
          )}
          {traitementsActifs.map((t) => (
            <div key={t.id} className="text-sm mb-1">
              <span className="font-medium">{t.medicament}</span>
              <span className="text-slate-500"> — {t.posologie}</span>
            </div>
          ))}
        </div>

        {/* Constantes biologiques : saisie rapide */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase mb-2">
            Constantes
          </h2>
          <SaisieConstantes
            patientId={id ?? ""}
            onAjoute={async () => {
              if (id) setConstantes(await api.listConstantes(id, token!));
            }}
          />
          {constantes.length > 0 && (
            <div className="mt-3 text-sm">
              {constantes.slice(0, 6).map((c) => (
                <div key={c.id} className="flex justify-between text-slate-600">
                  <span>{c.type}</span>
                  <span className="font-medium">
                    {c.valeur}
                    {c.unite ? ` ${c.unite}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {derniereConsultation && (
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-2">
              Dernière consultation
            </h2>
            <div className="text-sm">
              <div className="text-slate-500 text-xs mb-0.5">
                {new Date(derniereConsultation.date).toLocaleDateString("fr-FR")} —{" "}
                {derniereConsultation.motif}
              </div>
              {derniereConsultation.notes && (
                <p className="line-clamp-4 text-slate-600">
                  {derniereConsultation.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Colonne droite : actions + onglets */}
      <div className="flex-1 overflow-auto p-6">
        {/* Barre d'actions : tout à 1 clic */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setOnglet("consultations")}
            className="bg-sky-600 text-white px-4 py-2.5 rounded-xl hover:bg-sky-700 font-medium"
          >
            🩺 Nouvelle consultation
          </button>
          <button
            onClick={() => navigate(`/patients/${id}/ordonnance`)}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-xl hover:bg-slate-700 font-medium"
          >
            💊 Ordonnance
          </button>
          <button
            onClick={() => setCourrierOuvert(true)}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-xl hover:bg-slate-700 font-medium"
          >
            ✉️ Courrier
          </button>
        </div>

        {erreur && (
          <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>
        )}

        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {(["consultations", "antecedents", "traitements", "allergies", "documents"] as Onglet[]).map(
            (o) => (
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
                {o === "documents" ? "" : ""}
              </button>
            )
          )}
        </div>

        {onglet === "consultations" && (
          <SectionConsultations
            consultations={consultations}
            ajouter={ajouterConsultation}
            supprimer={supprimerUneConsultation}
            structurer={structurerNotes}
          />
        )}
        {onglet === "antecedents" && (
          <SectionAntecedents antecedents={antecedents} ajouter={ajouterAntecedent} />
        )}
        {onglet === "traitements" && (
          <SectionTraitements traitements={traitements} ajouter={ajouterTraitement} />
        )}
        {onglet === "allergies" && (
          <SectionAllergies allergies={allergies} ajouter={ajouterAllergie} />
        )}
        {onglet === "documents" && id && (
          <SectionDocuments patientId={id} cle={cleDocuments} />
        )}
      </div>

      {/* Module courrier intégré : patient verrouillé, archivage GED direct */}
      {courrierOuvert && id && identite && (
        <CourrierPatient
          patientId={id}
          patientNom={`${identite.prenoms} ${identite.nom}`}
          onFerme={() => setCourrierOuvert(false)}
          onArchive={() => {
            setCleDocuments((k) => k + 1);
            setOnglet("documents");
          }}
        />
      )}
    </div>
  );
}

function SectionConsultations({
  consultations,
  ajouter,
  supprimer,
  structurer,
}: {
  consultations: Consultation[];
  ajouter: (motif: string, notes: string) => Promise<void>;
  supprimer: (id: string) => Promise<void>;
  structurer: (
    motif: string,
    notes: string
  ) => Promise<{ motif: string; notes: string } | null>;
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
          rows={5}
          placeholder="Notes : examen, diagnostic, conduite à tenir…"
          className="w-full border border-slate-300 rounded-lg p-3"
        />
        <div className="flex gap-3">
          <button
            onClick={() =>
              ajouter(motif, notes).then(() => {
                setMotif("");
                setNotes("");
              })
            }
            disabled={!motif}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
          <button
            onClick={async () => {
              const r = await structurer(motif, notes);
              if (r) setNotes(r.notes);
            }}
            disabled={!notes.trim()}
            className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            title="Structure les notes prises à la hâte en observation claire"
          >
            ✨ Structurer
          </button>
        </div>
      </div>
      {consultations.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex justify-between">
            <span className="font-semibold">{c.motif}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {new Date(c.date).toLocaleString("fr-FR")}
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Supprimer cette consultation ?"))
                    supprimer(c.id);
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                🗑 Supprimer
              </button>
            </div>
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
            ajouter(cat, lib, annee ? parseInt(annee) : null).then(() => {
              setLib("");
              setAnnee("");
            })
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
            ajouter(med, poso, duree || null).then(() => {
              setMed("");
              setPoso("");
              setDuree("");
            })
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

function SectionDocuments({
  patientId,
  cle,
}: {
  patientId: string;
  cle: number;
}) {
  const [docs, setDocs] = useState<ResultatDocument[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    api
      .listDocuments(patientId)
      .then(setDocs)
      .catch((e) => setErreur(String(e)));
  }, [patientId, cle]);

  async function supprimerDoc(idDoc: string) {
    await api.supprimerDocument(idDoc, token!);
    setDocs(await api.listDocuments(patientId));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Documents de la GED rattachés à ce patient (imports, scans, courriers
        archivés). L'import se fait depuis la page GED.
      </p>
      {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
      {docs.length === 0 && !erreur && (
        <p className="text-sm text-slate-400">Aucun document pour ce patient.</p>
      )}
      {docs.map((d) => (
        <div
          key={d.id}
          className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">{d.nomFichier}</div>
            <div className="text-xs text-slate-400 mt-1">
              {new Date(d.createdAt).toLocaleString("fr-FR")}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {d.type}
            </span>
            <button
              onClick={() =>
                api.ouvrirDocument(d.id, token!).catch((e) => setErreur(String(e)))
              }
              className="text-xs text-sky-600 hover:text-sky-800"
            >
              👁 Voir
            </button>
            <button
              onClick={() => {
                if (window.confirm("Supprimer ce document (fichier inclus) ?"))
                  supprimerDoc(d.id);
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              🗑
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const TYPES_CONSTANTES = [
  { code: "TENSION", libelle: "Tension (ex. 12/8)", unite: null },
  { code: "POIDS", libelle: "Poids", unite: "kg" },
  { code: "GLYCEMIE", libelle: "Glycémie", unite: "g/L" },
  { code: "TEMPERATURE", libelle: "Température", unite: "°C" },
  { code: "SATURATION", libelle: "Saturation", unite: "%" },
];

function SaisieConstantes({
  patientId,
  onAjoute,
}: {
  patientId: string;
  onAjoute: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [type, setType] = useState(TYPES_CONSTANTES[0].code);
  const [valeur, setValeur] = useState("");

  async function enregistrer() {
    if (!valeur.trim()) return;
    const tc = TYPES_CONSTANTES.find((t) => t.code === type)!;
    await api.creerConstante(patientId, type, valeur, tc.unite, token!);
    setValeur("");
    await onAjoute();
  }

  return (
    <div className="flex gap-1">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
      >
        {TYPES_CONSTANTES.map((t) => (
          <option key={t.code} value={t.code}>
            {t.libelle}
          </option>
        ))}
      </select>
      <input
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && enregistrer()}
        placeholder="Valeur"
        className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 w-20"
      />
      <button
        onClick={enregistrer}
        disabled={!valeur.trim() || !patientId}
        className="text-xs bg-sky-600 text-white px-2 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-40"
      >
        ✓
      </button>
    </div>
  );
}
