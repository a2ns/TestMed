import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CreditCard } from "lucide-react";

export default function NouveauPatient() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nom: "",
    prenoms: "",
    dateNaissance: "",
    sexe: "",
    adresse: "",
    telephone: "",
    email: "",
    medecinTraitant: "",
    nir: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Masque JJ/MM/AAAA : chiffres uniquement, séparateurs insérés à la volée.
  function saisirDate(valeurBrute: string) {
    const chiffres = valeurBrute.replace(/\D/g, "").slice(0, 8);
    let formate = chiffres;
    if (chiffres.length > 2) formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
    if (chiffres.length > 4) formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
    setForm({ ...form, dateNaissance: formate });
  }

  function validerDate(): string | null {
    const d = form.dateNaissance;
    const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "date de naissance incomplète (JJ/MM/AAAA)";
    const [jj, mm, aa] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    if (mm < 1 || mm > 12) return "mois invalide (01-12)";
    if (jj < 1 || jj > 31) return "jour invalide (01-31)";
    const date = new Date(aa, mm - 1, jj);
    if (date.getDate() !== jj || date.getMonth() !== mm - 1) return "date inexistante";
    if (date > new Date()) return "date de naissance dans le futur";
    return null;
  }

  function champ(k: keyof typeof form) {
    return {
      value: form[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm({ ...form, [k]: e.target.value }),
    };
  }

  async function lireCarteVitale() {
    setErreur(null);
    try {
      const carte = await api.lireCarteVitale(token!);
      // Pr-remplissage : identit, date, sexe, NIR.
      const dn = carte.dateNaissance
        ? carte.dateNaissance.split("-").reverse().join("/")
        : "";
      setForm({
        ...form,
        nom: carte.nom || form.nom,
        prenoms: carte.prenoms || form.prenoms,
        dateNaissance: dn,
        sexe: carte.sexe || form.sexe,
        nir: carte.nir || form.nir,
        medecinTraitant: carte.medecinTraitant || form.medecinTraitant,
      });
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function enregistrer() {
    if (form.dateNaissance && validerDate()) {
      setErreur(validerDate());
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const id = await api.creerPatient({
        nom: form.nom,
        prenoms: form.prenoms,
        // Convertit JJ/MM/AAAA → AAAA-MM-JJ pour la base
        dateNaissance: form.dateNaissance
          ? form.dateNaissance.split("/").reverse().join("-")
          : null,
        sexe: form.sexe || null,
        adresse: form.adresse || null,
        telephone: form.telephone || null,
        email: form.email || null,
        medecinTraitant: form.medecinTraitant || null,
        nir: form.nir || null,
      });
      navigate(`/patients/${id}`);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate("/patients")}
        className="text-lavande-600 hover:underline text-sm mb-3"
      >
        ← Retour
      </button>
      <h1 className="text-2xl font-bold mb-6">Nouveau patient</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Carte Vitale insre dans le lecteur ? Crez la fiche en un clic.
        </p>
        <button
          onClick={lireCarteVitale}
          className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 inline-flex items-center gap-2 text-sm"
        >
          <CreditCard size={16} /> Lire la carte Vitale
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nom *</label>
            <input {...champ("nom")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Prénoms *</label>
            <input {...champ("prenoms")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              Date de naissance (JJ/MM/AAAA)
            </label>
            <input
              value={form.dateNaissance}
              onChange={(e) => saisirDate(e.target.value)}
              placeholder="14/03/1978"
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Sexe</label>
            <select {...champ("sexe")} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
              <option value="">—</option>
              <option value="F">Féminin</option>
              <option value="M">Masculin</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-500 mb-1">Adresse</label>
            <input {...champ("adresse")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Téléphone</label>
            <input {...champ("telephone")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Email</label>
            <input {...champ("email")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-500 mb-1">Médecin traitant</label>
            <input {...champ("medecinTraitant")} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-500 mb-1">
              N° de sécurité sociale (NIR) — stocké chiffré
            </label>
            <input
              value={form.nir}
              onChange={(e) => setForm({ ...form, nir: e.target.value.replace(/\D/g, "").slice(0, 15) })}
              placeholder="1751212123456 78"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
        {erreur && <p className="text-sm text-red-600">Erreur : {erreur}</p>}
        <div className="flex gap-3">
          <button
            onClick={enregistrer}
            disabled={!form.nom || !form.prenoms || enCours}
            className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
          >
            {enCours ? "Enregistrement…" : "Créer le patient"}
          </button>
          <button
            onClick={() => navigate("/patients")}
            className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
