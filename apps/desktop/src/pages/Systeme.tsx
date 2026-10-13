import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const ROLES = [
  { code: "MEDECIN", libelle: "Médecin" },
  { code: "SECRETAIRE", libelle: "Secrétaire" },
  { code: "ADMIN", libelle: "Administrateur" },
];

export default function Systeme() {
  const { token, utilisateur } = useAuth();
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [etatFsv, setEtatFsv] = useState<{ disponible: boolean; detail: string } | null>(null);
  const [etatDmp, setEtatDmp] = useState<{ configure: boolean; detail: string } | null>(null);

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState("MEDECIN");
  const [compteStatut, setCompteStatut] = useState<string | null>(null);

  useEffect(() => {
    if (utilisateur?.role !== "ADMIN") return;
    api.verifierFsv(token!).then(setEtatFsv).catch((e) => setErreur(String(e)));
    api.verifierDmp(token!).then(setEtatDmp).catch((e) => setErreur(String(e)));
  }, [token, utilisateur]);

  if (utilisateur?.role !== "ADMIN") {
    return (
      <div className="p-8">
        <p className="text-red-600">Page réservée au rôle ADMIN.</p>
      </div>
    );
  }

  async function sauvegarder() {
    setSauvegardeEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await api.lancerSauvegarde(token!);
      setResultat(
        `Sauvegarde chiffrée créée : ${res.chemin} (${(res.tailleOctets / 1024 / 1024).toFixed(1)} Mo)`
      );
    } catch (e) {
      setErreur(String(e));
    } finally {
      setSauvegardeEnCours(false);
    }
  }

  async function creerCompte() {
    setErreur(null);
    setCompteStatut(null);
    try {
      await api.creerCompte(identifiant, motDePasse, role, token!);
      setCompteStatut(`Compte « ${identifiant} » créé (${role})`);
      setIdentifiant("");
      setMotDePasse("");
    } catch (e) {
      setErreur(String(e));
    }
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Système &amp; administration</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-semibold">👥 Comptes utilisateurs</h2>
        <p className="text-sm text-slate-500">
          Créez les comptes du cabinet. Le praticien devrait ensuite compléter
          sa fiche (nom, RPPS, cabinet) pour l'en-tête des courriers.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Identifiant</label>
            <input
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="jdupont"
              className="border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Mot de passe</label>
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              {ROLES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.libelle}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={creerCompte}
            disabled={!identifiant || !motDePasse}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
          >
            + Créer le compte
          </button>
        </div>
        {compteStatut && (
          <p className="text-sm text-emerald-600">{compteStatut}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-semibold">💾 Sauvegarde chiffrée</h2>
        <p className="text-sm text-slate-500">
          Sauvegarde complète de la base (pg_dump), compressée puis chiffrée
          AES-256-GCM avec la clé maîtresse. Rétention automatique (30 par défaut,
          configurable via MAGICMED_SAUVEGARDE_RETENTION).
        </p>
        <button
          onClick={sauvegarder}
          disabled={sauvegardeEnCours}
          className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          {sauvegardeEnCours ? "Sauvegarde en cours…" : "Lancer une sauvegarde"}
        </button>
        {resultat && <p className="text-sm text-emerald-600">{resultat}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-2">
        <h2 className="font-semibold">🪪 Sesam-Vitale (FSV)</h2>
        <p
          className={`text-sm font-medium ${
            etatFsv?.disponible ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {etatFsv ? etatFsv.detail : "vérification…"}
        </p>
        <p className="text-xs text-slate-400">
          La facturation Vitale exige : contrat GIE SESAM-Vitale, logiciel FSV,
          lecteur certifié et CPS. Branchement FFI sgpv.dll en phase 2.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-2">
        <h2 className="font-semibold">🔗 DMP / téléservices</h2>
        <p
          className={`text-sm font-medium ${
            etatDmp?.configure ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {etatDmp ? etatDmp.detail : "vérification…"}
        </p>
        <p className="text-xs text-slate-400">
          Le dépôt DMP exige l'habilitation du cabinet, un certificat logiciel
          et l'INS du patient (via FSV/INSc). Phase 3.
        </p>
      </div>

      {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
    </div>
  );
}
