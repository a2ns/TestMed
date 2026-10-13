import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { connexion } = useAuth();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur(null);
    try {
      await connexion(identifiant, motDePasse);
    } catch (err) {
      setErreur(String(err));
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <form
        onSubmit={soumettre}
        className="bg-white rounded-2xl shadow-xl p-8 w-96 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">
          Magic<span className="text-sky-600">Med</span>
        </h1>
        <div>
          <label className="block text-sm text-slate-500 mb-1">Identifiant</label>
          <input
            autoFocus
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">
            Mot de passe
          </label>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          disabled={chargement || !identifiant || !motDePasse}
          className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
        >
          {chargement ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
