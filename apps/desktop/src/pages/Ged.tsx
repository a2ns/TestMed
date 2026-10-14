import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ResultatDocument } from "../lib/api";
import { useAuth } from "../lib/auth";
import PatientPicker from "../components/PatientPicker";
import { Eye, Trash2, FileUp, CheckCircle2, Inbox, Sparkles } from "lucide-react";
import IndicateurIa from "../components/IndicateurIa";

const TYPES = [
  "COURRIER",
  "COMPTE_RENDU",
  "ORDONNANCE",
  "RESULTAT_EXAMEN",
  "IMAGERIE",
  "CERTIFICAT",
  "FACTURE",
  "AUTRE",
];

export default function Ged() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [patientId, setPatientId] = useState("");
  const [patientNom, setPatientNom] = useState("");
  const [typeDoc, setTypeDoc] = useState("AUTRE");

  function setPatient(id: string, nom: string) {
    setPatientId(id);
    setPatientNom(nom);
  }
  const [scanners, setScanners] = useState<string[]>([]);
  const [scanner, setScanner] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [scanEnCours, setScanEnCours] = useState(false);

  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [resultats, setResultats] = useState<ResultatDocument[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);

  // Caddie des documents à trier
  const [caddie, setCaddie] = useState<ResultatDocument[]>([]);

  function rafraichirCaddie() {
    api
      .listDocumentsATrier(token!)
      .then(setCaddie)
      .catch(() => undefined);
  }

  useEffect(() => {
    rafraichirCaddie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La détection des scanners (scanimage) peut être lente : elle ne se
  // lance qu'à la demande, au clic sur le sélecteur, jamais au chargement.
  const [scanDetection, setScanDetection] = useState<
    "inconnu" | "en-cours" | "termine"
  >("inconnu");

  function detecterScanners() {
    if (scanDetection !== "inconnu") return;
    setScanDetection("en-cours");
    api
      .listerScanners()
      .then((s) => {
        setScanners(s);
        if (s.length > 0) setScanner(s[0]);
      })
      .catch(() => undefined)
      .finally(() => setScanDetection("termine"));
  }

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    setRechercheEnCours(true);
    api
      .rechercheDocuments(recherche, filtreType || null, token!)
      .then(setResultats)
      .catch((e) => setErreur(String(e)))
      .finally(() => setRechercheEnCours(false));
  }, [recherche, filtreType, token]);

  async function importerFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    setStatut(null);
    try {
      const chemin = await import("@tauri-apps/plugin-dialog").then((d) =>
        d.open({ multiple: false })
      );
      if (!chemin) return;
      // Import intelligent : OCR + détection du patient ; caddie si inconnu.
      const res = await api.importerIntelligent(
        String(chemin),
        fichier.name,
        typeDoc,
        patientId || null,
        token!
      );
      setStatut(
        res.aTrier
          ? `Document placé dans le caddie (patient non identifié par OCR)`
          : `Document importé et rattaché au patient automatiquement`
      );
      rafraichirCaddie();
    } catch (err) {
      setErreur(String(err));
    }
  }

  async function lancerScanMasse() {
    if (!scanner) return;
    setScanEnCours(true);
    setErreur(null);
    setStatut(null);
    try {
      const dossierGed = await import("@tauri-apps/api/path").then((p) =>
        p.appDataDir().then((d) => `${d}ged`)
      );
      const res = await api.scanMasse(scanner, dossierGed, patientId || null, typeDoc, token!);
      setStatut(
        `Scan terminé : ${res.nbPages} page(s), document ${res.idDocument.slice(0, 8)}… indexé (OCR)`
      );
    } catch (e) {
      setErreur(String(e));
    } finally {
      setScanEnCours(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">GED — MagicGed</h1>

      {/* Caddie : documents en attente de rattachement patient */}
      {caddie.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-300 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-amber-800">
            <Inbox size={16} className="inline" /> {caddie.length} document{caddie.length > 1 ? "s" : ""} à trier
          </h2>
          {caddie.map((doc) => (
            <LigneCaddie
              key={doc.id}
              doc={doc}
              token={token!}
              onClasse={() => rafraichirCaddie()}
            />
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="font-semibold">Recherche plein texte</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher dans le contenu des documents (OCR)…"
            className="flex-1 min-w-72 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-lavande-400"
          />
          <select
            value={filtreType}
            onChange={(e) => setFiltreType(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">Tous les types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {rechercheEnCours && (
          <p className="text-sm text-slate-500">Recherche…</p>
        )}
        {resultats.length > 0 && (
          <div className="divide-y rounded-lg border border-slate-200">
            {resultats.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 bg-nuit-100 px-2 py-1 rounded">
                      {r.type}
                    </span>
                    <span className="font-medium">{r.nomFichier}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {r.nomPatient && (
                    <button
                      onClick={() => navigate(`/patients/${r.patientId}`)}
                      className="text-lavande-600 hover:underline text-sm"
                    >
                      {r.nomPatient}
                    </button>
                  )}
                  <button
                    onClick={() => api.ouvrirDocument(r.id, token!).catch((e) =>
                      setErreur(String(e))
                    )}
                    className="text-xs text-lavande-600 hover:text-lavande-800"
                  >
                    <Eye size={14} className="inline" /> Voir
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm("Supprimer ce document (fichier inclus) ?")) {
                        await api.supprimerDocument(r.id, token!);
                        setResultats(resultats.filter((x) => x.id !== r.id));
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={14} className="inline" /> Supprimer
                  </button>
                </div>
                {r.extrait && (
                  <p
                    className="text-sm text-nuit-500 mt-1"
                    dangerouslySetInnerHTML={{
                      __html: r.extrait
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/\[\[/g, '<mark class="bg-yellow-200">')
                        .replace(/\]\]/g, "</mark>"),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {recherche.trim().length >= 2 && !rechercheEnCours && resultats.length === 0 && (
          <p className="text-sm text-slate-500">Aucun document trouvé.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 mt-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-64">
            <PatientPicker
              label="Patient (optionnel)"
              patientId={patientId}
              patientNom={patientNom}
              onSelect={setPatient}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Type</label>
            <select
              value={typeDoc}
              onChange={(e) => setTypeDoc(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <label className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 cursor-pointer">
            <FileUp size={16} className="inline" /> Importer un fichier
            <input type="file" className="hidden" onChange={importerFichier} />
          </label>
        </div>

        <div className="border-t border-nuit-100 pt-4">
          <h2 className="font-semibold mb-3">Scan de masse (chargeur ADF)</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Scanner</label>
              <select
                value={scanner}
                onChange={(e) => setScanner(e.target.value)}
                onClick={detecterScanners}
                onFocus={detecterScanners}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white min-w-64"
                disabled={scanDetection === "en-cours"}
              >
                {scanDetection === "en-cours" && <option>Détection des scanners…</option>}
                {scanDetection !== "en-cours" && scanners.length === 0 && (
                  <option>Aucun scanner détecté</option>
                )}
                {scanners.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={lancerScanMasse}
              disabled={scanEnCours || !scanner}
              className="bg-nuit-950 text-white px-4 py-2 rounded-lg hover:bg-nuit-700 disabled:opacity-40"
            >
              {scanEnCours ? "Scan + OCR en cours…" : "Scanner en masse"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Les pages sont assemblées en PDF puis reconnues par OCR (Tesseract,
            français) et indexées pour la recherche plein texte.
          </p>
        </div>

        {statut && <p className="text-sm text-emerald-600">{statut}</p>}
        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
      </div>
    </div>
  );
}

function LigneCaddie({
  doc,
  token,
  onClasse,
}: {
  doc: ResultatDocument;
  token: string;
  onClasse: () => void;
}) {
  const [patientId, setPatientId] = useState("");
  const [patientNom, setPatientNom] = useState("");
  const [typeChoisi, setTypeChoisi] = useState("AUTRE");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [analyseIa, setAnalyseIa] = useState<string | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);

  async function analyser() {
    setAnalyseIa(null);
    setErreur(null);
    setAnalyseEnCours(true);
    try {
      const a = await api.analyserDocumentIa(doc.extrait ?? "", token);
      // Pré-sélection du type proposé
      if (TYPES.includes(a.typeDocument)) setTypeChoisi(a.typeDocument);
      // Recherche du patient proposé : si trouvé, pré-remplir le picker
      if (a.nomPatient) {
        try {
          const res = await api.listPatients(a.nomPatient);
          if (res.length === 1) {
            setPatientId(res[0].id);
            setPatientNom(`${res[0].prenoms} ${res[0].nom}`);
          }
        } catch {
          /* pas de correspondance exacte : le médecin cherche manuellement */
        }
      }
      setAnalyseIa(
        `IA : ${a.typeDocument}${a.nomPatient ? ` — patient probable : ${a.nomPatient}` : ""} (confiance ${Math.round(a.confiance * 100)}%)${a.commentaire ? ` — ${a.commentaire}` : ""}`
      );
    } catch (e) {
      setErreur(String(e));
    } finally {
      setAnalyseEnCours(false);
    }
  }

  async function classer() {
    if (!patientId) return;
    setEnCours(true);
    setErreur(null);
    try {
      await api.classerDocument(doc.id, patientId, typeChoisi, token);
      onClasse();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-amber-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{doc.nomFichier}</span>
        <span className="text-xs text-slate-400">
          {new Date(doc.createdAt).toLocaleString("fr-FR")}
        </span>
      </div>
      {doc.extrait && (
        <p className="text-xs text-slate-500 line-clamp-2">{doc.extrait}</p>
      )}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-56">
          <PatientPicker
            label="Rattacher à"
            patientId={patientId}
            patientNom={patientNom}
            onSelect={(id, nom) => {
              setPatientId(id);
              setPatientNom(nom);
            }}
          />
        </div>
        <select
          value={typeChoisi}
          onChange={(e) => setTypeChoisi(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={analyser}
          className="bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm inline-flex items-center gap-1"
          title="L'IA analyse l'OCR : type de document et patient probable"
        >
          <Sparkles size={14} /> Analyser
        </button>
        <button
          onClick={classer}
          disabled={!patientId || enCours}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-40 text-sm inline-flex items-center gap-1"
        >
          <CheckCircle2 size={14} /> Classer
        </button>
      </div>
      <IndicateurIa actif={analyseEnCours} tache="analyse" />
      {analyseIa && (
        <p className="text-xs text-lavande-700 bg-lavande-50 border border-lavande-200 rounded-lg px-3 py-2">
          {analyseIa}
        </p>
      )}
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
