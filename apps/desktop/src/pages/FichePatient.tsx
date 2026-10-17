import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  api,
  Antecedent,
  Allergie,
  Consultation,
  Traitement,
  ResultatDocument,
  ConstanteBio,
  CourrierDossier,
  apiDossier,
  apiDossierVaccins,
  VaccinationDossier,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import CourrierPatient from "../components/CourrierPatient";
import IndicateurIa from "../components/IndicateurIa";
import {
  Stethoscope,
  Pill,
  Mail,
  Pencil,
  Sparkles,
  Eye,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  CreditCard,
} from "lucide-react";

type Onglet = "consultations" | "antecedents" | "traitements" | "allergies" | "constantes" | "courriers" | "vaccins" | "documents";

const CATEGORIES = ["MEDICAL", "CHIRURGICAL", "FAMILIAL", "OBSTETRIQUE", "TOXIQUE"];
const GRAVITES = ["SEVERE", "MODEREE", "FAIBLE"];
/// Formate une valeur de constante : "160.00000" -> "160", "43.700001" -> "43,7",
/// "0.0000000" -> invalide (None). Gère le séparateur décimal français.
function formaterValeur(valeur: string): string | null {
  const n = parseFloat(valeur.replace(",", "."));
  if (isNaN(n)) return valeur; // valeur textuelle non numérique (ex. "130/70")
  if (n === 0) return null; // artefact de migration (IMC 0.0000000)
  // arrondi : entiers sans décimales, sinon 1-2 décimales significatives
  const arrondi = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(arrondi).replace(".", ",");
}

const LIBELLES_CONSTANTES: Record<string, string> = {
  TENSION_SYST: "Tension syst.",
  TENSION_DIAST: "Tension diast.",
  POIDS: "Poids",
  TAILLE: "Taille",
  IMC: "IMC",
  GLYCEMIE: "Glycémie",
};

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
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [patientComplet, setPatientComplet] = useState<{
    id: string;
    nom: string;
    prenoms: string;
    dateNaissance: string | null;
    sexe: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    medecinTraitant: string | null;
    nir: string | null;
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
        setPatientComplet(p);
        setIdentite({ nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance });
        setConsultations(c);
        setAntecedents(a);
        setTraitements(t);
        setAllergies(al);
        setConstantes(cb);
      })
      .catch((e) => setErreur(String(e)));
  }, [id, token]);

  async function lireCarteVitale() {
    setErreur(null);
    try {
      const carte = await api.lireCarteVitale(token!);
      // Met  jour l'identit affiche et le NIR (chiffr  l'enregistrement).
      if (id) {
        await api.majPatient(
          {
            id,
            nom: carte.nom || identite?.nom || "",
            prenoms: carte.prenoms || identite?.prenoms || "",
            dateNaissance: carte.dateNaissance || null,
            sexe: carte.sexe || null,
            adresse: null,
            telephone: null,
            email: null,
            medecinTraitant: carte.medecinTraitant || null,
            nir: carte.nir || null,
          },
          token!
        );
        const p = await api.getPatient(id, token!);
        setPatientComplet(p);
        setIdentite({ nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance });
        setErreur(null);
      }
    } catch (e) {
      setErreur(String(e));
    }
  }

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
            className="text-xs text-slate-400 hover:text-nuit-500 mb-2"
          >
            <ArrowLeft size={14} /> Recherche
          </button>
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-bold">
              {identite ? `${identite.prenoms} ${identite.nom}` : "…"}
            </h1>
            <div className="flex gap-1">
              <button
                onClick={lireCarteVitale}
                className="text-slate-400 hover:text-lavande-600"
                title="Lire la carte Vitale (poste Windows FSV)"
              >
                <CreditCard size={16} />
              </button>
              <button
                onClick={() => setEditionOuverte(true)}
                className="text-slate-400 hover:text-lavande-600"
                title="Modifier la fiche patient"
              >
                <Pencil size={16} />
              </button>
            </div>
          </div>
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
              <AlertTriangle size={12} className="inline" /> Allergies
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
              {constantes
                .map((c) => ({ c, val: formaterValeur(c.valeur) }))
                .filter(({ val }) => val !== null)
                .slice(0, 8)
                .map(({ c, val }) => (
                  <div key={c.id} className="flex justify-between text-nuit-500">
                    <span>
                      {LIBELLES_CONSTANTES[c.type] || c.type}
                      <span className="text-xs text-slate-400 ml-1">
                        {c.date ? new Date(c.date).toLocaleDateString("fr-FR") : ""}
                      </span>
                    </span>
                    <span className="font-medium">
                      {val}
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
                <p className="line-clamp-4 text-nuit-500">
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
            className="bg-lavande-600 text-white px-4 py-2.5 rounded-xl hover:bg-lavande-700 font-medium inline-flex items-center gap-2"
          >
            <Stethoscope size={18} /> Nouvelle consultation
          </button>
          <button
            onClick={() => navigate(`/patients/${id}/ordonnance`)}
            className="bg-nuit-950 text-white px-4 py-2.5 rounded-xl hover:bg-nuit-700 font-medium inline-flex items-center gap-2"
          >
            <Pill size={18} /> Ordonnance
          </button>
          <button
            onClick={() => setCourrierOuvert(true)}
            className="bg-nuit-950 text-white px-4 py-2.5 rounded-xl hover:bg-nuit-700 font-medium inline-flex items-center gap-2"
          >
            <Mail size={18} /> Courrier
          </button>
        </div>

        {erreur && (
          <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>
        )}

        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {(["consultations", "antecedents", "traitements", "allergies", "constantes", "courriers", "vaccins", "documents"] as Onglet[]).map(
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
            constantes={constantes}
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
        {onglet === "constantes" && (
          <SectionBio constantes={constantes} />
        )}
        {onglet === "courriers" && id && (
          <SectionCourriers patientId={id} />
        )}
        {onglet === "vaccins" && id && (
          <SectionVaccins patientId={id} />
        )}
        {onglet === "documents" && id && (
          <SectionDocuments patientId={id} cle={cleDocuments} />
        )}
      </div>

      {/* Édition de la fiche patient */}
      {editionOuverte && patientComplet && id && (
        <EditionPatient
          patient={patientComplet}
          onFerme={() => setEditionOuverte(false)}
          onEnregistre={async () => {
            const p = await api.getPatient(id, token!);
            setPatientComplet(p);
            setIdentite({
              nom: p.nom,
              prenoms: p.prenoms,
              dateNaissance: p.dateNaissance,
            });
            setEditionOuverte(false);
          }}
        />
      )}

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
  constantes,
  ajouter,
  supprimer,
  structurer,
}: {
  consultations: Consultation[];
  constantes: ConstanteBio[];
  ajouter: (motif: string, notes: string) => Promise<void>;
  supprimer: (id: string) => Promise<void>;
  structurer: (
    motif: string,
    notes: string
  ) => Promise<{ motif: string; notes: string } | null>;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [notes, setNotes] = useState("");
  const [structureEnCours, setStructureEnCours] = useState(false);
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
        <EditeurNotes valeur={notes} onChange={setNotes} />
        <div className="flex gap-3">
          <button
            onClick={() =>
              ajouter(motif, notes).then(() => {
                setMotif("");
                setNotes("");
              })
            }
            disabled={!motif}
            className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
          <button
            onClick={async () => {
              setStructureEnCours(true);
              try {
                const r = await structurer(motif, notes);
                if (r) setNotes(r.notes);
              } finally {
                setStructureEnCours(false);
              }
            }}
            disabled={!notes.trim()}
            className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100 disabled:opacity-40"
            title="Structure les notes prises à la hâte en observation claire"
          >
            <Sparkles size={14} className="inline" /> Structurer
          </button>
        </div>
        <IndicateurIa actif={structureEnCours} tache="structuration" />
      </div>
      {consultations.map((c) => {
        const titre = c.motif ||
          (c.notes ? c.notes.replace(/<[^>]+>/g, "").split("\n")[0].slice(0, 70) : "Consultation");
        const jour = c.date ? c.date.slice(0, 10) : null;
        const constantesDuJour = jour
          ? constantes.filter((v) => v.date && v.date.slice(0, 10) === jour)
          : [];
        return (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200">
          <button
            onClick={() => setOuverte((v) => (v === c.id ? null : c.id))}
            className="w-full flex justify-between items-center text-left p-4 hover:bg-slate-50"
          >
            <span className="font-semibold text-sm truncate max-w-[70%]">{titre}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {new Date(c.date).toLocaleString("fr-FR")}
              </span>
            </div>
          </button>
          {ouverte === c.id && (
            <div className="px-4 pb-4 border-t border-slate-100">
              {constantesDuJour.length > 0 && (
                <div className="mt-2 mb-3 flex flex-wrap gap-3 p-2.5 rounded-lg bg-sky-50 border border-sky-100">
                  <span className="text-xs font-semibold text-sky-700 self-center">
                    Constantes du jour :
                  </span>
                  {constantesDuJour.map((v) => (
                    <span
                      key={v.id}
                      className="text-sm text-sky-900 bg-white px-2 py-0.5 rounded border border-sky-100"
                    >
                      {LIBELLES_CONSTANTES[v.type] || v.type}{" "}
                      <b>{formaterValeur(v.valeur) ?? v.valeur}</b>
                      {v.unite ? ` ${v.unite}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {c.notes ? (
                <NotesRiches texte={c.notes} />
              ) : (
                <p className="text-sm text-slate-400 italic mt-2">
                  Consultation sans rédaction.
                </p>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    if (window.confirm("Supprimer cette consultation ?"))
                      supprimer(c.id);
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  <Trash2 size={14} className="inline" /> Supprimer
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })}
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
          className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
        <thead className="bg-nuit-100 text-slate-500">
          <tr>
            <th className="px-4 py-2">Catégorie</th>
            <th className="px-4 py-2">Libellé</th>
            <th className="px-4 py-2">Année</th>
          </tr>
        </thead>
        <tbody>
          {antecedents.map((a) => (
            <tr key={a.id} className="border-t border-nuit-100">
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
          className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-left text-sm">
        <thead className="bg-nuit-100 text-slate-500">
          <tr>
            <th className="px-4 py-2">Médicament</th>
            <th className="px-4 py-2">Posologie</th>
            <th className="px-4 py-2">Durée</th>
            <th className="px-4 py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {traitements.map((t) => (
            <tr key={t.id} className="border-t border-nuit-100">
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
          className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
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
                    : "bg-nuit-100 text-slate-500"
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
            <span className="text-xs font-bold text-slate-500 bg-nuit-100 px-2 py-1 rounded">
              {d.type}
            </span>
            <button
              onClick={() =>
                api.ouvrirDocument(d.id, token!).catch((e) => setErreur(String(e)))
              }
              className="text-xs text-lavande-600 hover:text-lavande-800"
            >
              <Eye size={14} className="inline" /> Voir
            </button>
            <button
              onClick={() => {
                if (window.confirm("Supprimer ce document (fichier inclus) ?"))
                  supprimerDoc(d.id);
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              <Trash2 size={14} />
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
        className="text-xs bg-lavande-600 text-white px-2 py-1.5 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
      >
        ✓
      </button>
    </div>
  );
}

function EditionPatient({
  patient,
  onFerme,
  onEnregistre,
}: {
  patient: {
    id: string;
    nom: string;
    prenoms: string;
    dateNaissance: string | null;
    sexe: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    medecinTraitant: string | null;
    nir: string | null;
  };
  onFerme: () => void;
  onEnregistre: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    nom: patient.nom,
    prenoms: patient.prenoms,
    // AAAA-MM-JJ → JJ/MM/AAAA pour l'édition
    dateNaissance: patient.dateNaissance
      ? patient.dateNaissance.split("-").reverse().join("/")
      : "",
    sexe: patient.sexe ?? "",
    adresse: patient.adresse ?? "",
    telephone: patient.telephone ?? "",
    email: patient.email ?? "",
    medecinTraitant: patient.medecinTraitant ?? "",
    nir: patient.nir ?? "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function maj(k: keyof typeof form, v: string) {
    setForm({ ...form, [k]: v });
  }

  // Masque JJ/MM/AAAA (identique à la création)
  function saisirDate(valeurBrute: string) {
    const chiffres = valeurBrute.replace(/\D/g, "").slice(0, 8);
    let formate = chiffres;
    if (chiffres.length > 2) formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
    if (chiffres.length > 4)
      formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
    maj("dateNaissance", formate);
  }

  async function enregistrer() {
    if (!form.nom.trim()) {
      setErreur("le nom est obligatoire");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await api.majPatient(
        {
          id: patient.id,
          nom: form.nom,
          prenoms: form.prenoms,
          dateNaissance: form.dateNaissance
            ? form.dateNaissance.split("/").reverse().join("-")
            : null,
          sexe: form.sexe || null,
          adresse: form.adresse || null,
          telephone: form.telephone || null,
          email: form.email || null,
          medecinTraitant: form.medecinTraitant || null,
          nir: form.nir || null,
        },
        token!
      );
      await onEnregistre();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-nuit-950/50 z-40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Modifier la fiche patient</h2>
          <button onClick={onFerme} className="text-slate-400 hover:text-slate-700 text-xl">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nom *</label>
            <input
              value={form.nom}
              onChange={(e) => maj("nom", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Prénoms *</label>
            <input
              value={form.prenoms}
              onChange={(e) => maj("prenoms", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Date de naissance (JJ/MM/AAAA)
            </label>
            <input
              value={form.dateNaissance}
              onChange={(e) => saisirDate(e.target.value)}
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Sexe</label>
            <select
              value={form.sexe}
              onChange={(e) => maj("sexe", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">—</option>
              <option value="F">Féminin</option>
              <option value="M">Masculin</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-500 mb-1">Adresse</label>
            <input
              value={form.adresse}
              onChange={(e) => maj("adresse", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Téléphone</label>
            <input
              value={form.telephone}
              onChange={(e) => maj("telephone", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Email</label>
            <input
              value={form.email}
              onChange={(e) => maj("email", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Médecin traitant</label>
            <input
              value={form.medecinTraitant}
              onChange={(e) => maj("medecinTraitant", e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              NIR (stocké chiffré)
            </label>
            <input
              value={form.nir}
              onChange={(e) => maj("nir", e.target.value.replace(/\D/g, "").slice(0, 15))}
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
        {erreur && <p className="text-sm text-red-600 mt-3">Erreur : {erreur}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={enregistrer}
            disabled={enCours}
            className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            onClick={onFerme}
            className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}


/// Affiche une note : HTML enrichi (issu du RTF MagicMed converti) ou texte brut.
/// Sanitizer maison : seuls strong/em/u/br/p/ul/ol/li sont conservés.
function sanitiserHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const AUTORISES = new Set(["STRONG", "EM", "U", "BR", "P", "UL", "OL", "LI",
                            "B", "I", "#text"]);
  const nettoyer = (noeud: Node) => {
    [...noeud.childNodes].forEach((enfant) => {
      if (!AUTORISES.has(enfant.nodeName)) {
        enfant.replaceWith(...Array.from(enfant.childNodes));
      }
      nettoyer(enfant);
    });
  };
  nettoyer(div);
  return div.innerHTML;
}

function NotesRiches({ texte }: { texte: string }) {
  const estHtml = texte.startsWith("<p>");
  if (estHtml) {
    return (
      <div
        className="mt-2 text-sm prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitiserHtml(texte) }}
      />
    );
  }
  return <p className="mt-2 text-sm whitespace-pre-wrap">{texte}</p>;
}


/// Éditeur de notes enrichies : barre d'outils (gras/italique/souligné/liste)
/// + zone contentEditable. Produit du HTML simple (<b>/<i>/<u>/<ul>/<li>/<br>)
/// compatible avec l'affichage NotesRiches (sanitisé à l'affichage).
function EditeurNotes({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // synchroniser le contenu externe -> éditeur (une seule fois, sans écraser le curseur)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== valeur && document.activeElement !== ref.current) {
      ref.current.innerHTML = valeur || "";
    }
  }, [valeur]);

  const emettre = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML);
    }
  };

  const cmd = (commande: string, arg?: string) => {
    document.execCommand(commande, false, arg);
    ref.current?.focus();
    emettre();
  };

  const bouton = "px-2 py-1 border border-slate-300 rounded text-sm hover:bg-slate-100";

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      <div className="flex gap-1 p-1.5 bg-slate-50 border-b border-slate-200">
        <button type="button" className={bouton} onClick={() => cmd("bold")}
          title="Gras"><b>G</b></button>
        <button type="button" className={bouton} onClick={() => cmd("italic")}
          title="Italique"><i>I</i></button>
        <button type="button" className={bouton} onClick={() => cmd("underline")}
          title="Souligné"><u>U</u></button>
        <button type="button" className={bouton} onClick={() => cmd("insertUnorderedList")}
          title="Liste à puces">• —</button>
        <button type="button" className={bouton} onClick={() => cmd("formatBlock", "<p>")}
          title="Paragraphe">¶</button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={emettre}
        onBlur={emettre}
        data-placeholder="Notes : examen, diagnostic, conduite à tenir…"
        className="min-h-[120px] p-3 text-sm focus:outline-none prose prose-sm max-w-none"
      />
    </div>
  );
}

/// Onglet Constantes : mesures du cabinet lues par DATE (comme en consultation) —
/// chaque date regroupe les constantes mesurées ce jour-là.
function SectionBio({ constantes }: { constantes: ConstanteBio[] }) {
  const LIBELLES: Record<string, string> = {
    TENSION_SYST: "Tension syst.",
    TENSION_DIAST: "Tension diast.",
    POIDS: "Poids",
    TAILLE: "Taille",
    IMC: "IMC",
    GLYCEMIE: "Glycémie",
  };
  // regrouper par date (YYYY-MM-DD), ordre chronologique décroissant
  const parDate = constantes.reduce<Record<string, ConstanteBio[]>>((acc, c) => {
    const d = c.date ? c.date.slice(0, 10) : "sans date";
    (acc[d] = acc[d] || []).push(c);
    return acc;
  }, {});
  const dates = Object.keys(parDate).sort().reverse();

  if (constantes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">
        Aucune constante enregistrée.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {dates.map((d) => {
        const valeurs = parDate[d];
        const libelle =
          d === "sans date"
            ? "Date inconnue"
            : new Date(d).toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              });
        return (
          <div
            key={d}
            className="bg-white rounded-xl border border-slate-200 p-4"
          >
            <div className="text-xs font-semibold text-slate-400 uppercase mb-2">
              {libelle}
            </div>
            <div className="flex flex-wrap gap-4">
              {valeurs
                .map((v) => ({ v, val: formaterValeur(v.valeur) }))
                .filter(({ val }) => val !== null)
                .map(({ v, val }) => (
                  <div key={v.id}>
                    <div className="text-xs text-slate-500">
                      {LIBELLES[v.type] || v.type}
                    </div>
                    <div className="font-bold text-lg">
                      {val}
                      {v.unite ? (
                        <span className="text-xs font-normal text-slate-500">
                          {" "}
                          {v.unite}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/// Onglet Courriers : tous les courriers/ordonnances du patient, lecture intégrale
function SectionCourriers({ patientId }: { patientId: string }) {
  const [courriers, setCourriers] = useState<CourrierDossier[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    apiDossier
      .listCourriersPatient(patientId)
      .then(setCourriers)
      .catch((e) => setErreur(String(e)))
      .finally(() => setChargement(false));
  }, [patientId]);

  if (chargement) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (erreur)
    return (
      <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {erreur}
      </p>
    );
  if (courriers.length === 0)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">
        Aucun courrier pour ce patient.
      </div>
    );
  return (
    <div className="space-y-2">
      {courriers.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200">
          <button
            onClick={() => setOuvert((v) => (v === c.id ? null : c.id))}
            className="w-full flex justify-between items-center p-4 hover:bg-slate-50 text-left"
          >
            <span className="font-medium text-sm truncate max-w-[60%]">
              {c.sujet || "(sans objet)"}
            </span>
            <span className="flex items-center gap-3 text-sm text-slate-500">
              <span className="px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700">
                {c.statut}
              </span>
              {c.date ? new Date(c.date).toLocaleDateString("fr-FR") : "—"}
            </span>
          </button>
          {ouvert === c.id && (
            <div className="px-4 pb-4 border-t border-slate-100">
              {c.contenu ? (
                <NotesRiches texte={c.contenu} />
              ) : (
                <p className="text-sm text-slate-400 italic">
                  Document sans contenu textuel.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


/// Onglet Vaccins : vaccinations du patient, statut vaccinal lisible.
function SectionVaccins({ patientId }: { patientId: string }) {
  const [vaccins, setVaccins] = useState<VaccinationDossier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    apiDossierVaccins
      .listVaccinationsPatient(patientId)
      .then(setVaccins)
      .catch((e) => setErreur(String(e)))
      .finally(() => setChargement(false));
  }, [patientId]);

  if (chargement) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (erreur)
    return (
      <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {erreur}
      </p>
    );
  if (vaccins.length === 0)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">
        Aucune vaccination enregistrée.
      </div>
    );
  return (
    <div className="space-y-2">
      {vaccins.map((v) => (
        <div
          key={v.id}
          className="bg-white rounded-xl border border-slate-200 p-4 flex justify-between items-center"
        >
          <div>
            <div className="font-medium">{v.vaccin}</div>
            <div className="text-xs text-slate-400">
              {v.lot ? `Lot ${v.lot}` : ""}
              {v.dateRappel
                ? ` · Rappel : ${new Date(v.dateRappel).toLocaleDateString("fr-FR")}`
                : ""}
            </div>
          </div>
          <span className="text-sm text-slate-500">
            {v.date ? new Date(v.date).toLocaleDateString("fr-FR") : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
