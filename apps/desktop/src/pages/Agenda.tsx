import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Patient, RendezVous } from "../lib/api";
import { useAuth } from "../lib/auth";

const DEB = 8;
const FIN = 19;
const CRENEAU = 20;

const DUREES = [10, 20, 30, 45, 60];

function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Agenda() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [jour, setJour] = useState(dateLocale(new Date()));
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  // Création
  const [formVisible, setFormVisible] = useState(false);
  const [creneau, setCreneau] = useState("");
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientNom, setPatientNom] = useState("");
  const [motif, setMotif] = useState("");

  // Modification
  const [rdvModif, setRdvModif] = useState<RendezVous | null>(null);
  const [modifHeure, setModifHeure] = useState("");
  const [modifDuree, setModifDuree] = useState(20);
  const [modifMotif, setMotifModif] = useState("");

  // Suppression : confirmation
  const [rdvSuppression, setRdvSuppression] = useState<RendezVous | null>(null);

  useEffect(() => {
    api
      .listRdvJour(jour)
      .then(setRdvs)
      .catch((e) => setErreur(String(e)));
  }, [jour]);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    api
      .listPatients(recherche)
      .then(setResultats)
      .catch(() => setResultats([]));
  }, [recherche]);

  function creneauxDuJour() {
    const slots: string[] = [];
    for (let h = DEB; h < FIN; h++) {
      for (let m = 0; m < 60; m += CRENEAU) {
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return slots;
  }

  function rdvPourHeure(hhmm: string): RendezVous | undefined {
    return rdvs.find((r) => {
      const d = new Date(r.debut);
      return (
        String(d.getHours()).padStart(2, "0") === hhmm.slice(0, 2) &&
        String(d.getMinutes()).padStart(2, "0") === hhmm.slice(3)
      );
    });
  }

  function ouvrirCreation(hhmm: string) {
    setCreneau(hhmm);
    setFormVisible(true);
    setPatientId("");
    setPatientNom("");
    setRecherche("");
    setMotif("");
  }

  function ouvrirModification(r: RendezVous) {
    const d = new Date(r.debut);
    setRdvModif(r);
    setModifHeure(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
    setModifDuree(r.dureeMin);
    setMotifModif(r.motif ?? "");
  }

  async function rafraichir() {
    setRdvs(await api.listRdvJour(jour));
  }

  async function enregistrerRdv() {
    if (!patientId || !creneau) return;
    setErreur(null);
    try {
      const debutIso = new Date(`${jour}T${creneau}:00`).toISOString();
      await api.creerRdv(patientId, debutIso, CRENEAU, motif || null, null);
      await rafraichir();
      setFormVisible(false);
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function enregistrerModification() {
    if (!rdvModif || !modifHeure) return;
    setErreur(null);
    try {
      const debutIso = new Date(`${jour}T${modifHeure}:00`).toISOString();
      await api.modifierRdv(rdvModif.id, debutIso, modifDuree, modifMotif || null, token!);
      setRdvModif(null);
      await rafraichir();
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function supprimer() {
    if (!rdvSuppression) return;
    setErreur(null);
    try {
      await api.supprimerRdv(rdvSuppression.id, token!);
      setRdvSuppression(null);
      await rafraichir();
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function changerStatut(r: RendezVous, statut: string) {
    await api.changerStatutRdv(r.id, statut);
    await rafraichir();
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <input
          type="date"
          value={jour}
          onChange={(e) => setJour(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
        />
      </div>

      {/* Formulaire de création */}
      {formVisible && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-3">
          <h2 className="font-semibold">
            Nouveau rendez-vous — {creneau} ({jour})
          </h2>
          <div>
            <input
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher le patient…"
              className="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2"
            />
            {resultats.length > 0 && !patientId && (
              <div className="mt-2 border border-slate-200 rounded-lg divide-y max-w-md">
                {resultats.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientNom(`${p.prenoms} ${p.nom}`);
                      setResultats([]);
                    }}
                    className="block w-full text-left px-3 py-2 hover:bg-lavande-50 text-sm"
                  >
                    {p.prenoms} <span className="font-medium">{p.nom}</span>
                  </button>
                ))}
              </div>
            )}
            {patientId && (
              <p className="mt-2 text-sm">
                Patient : <span className="font-semibold">{patientNom}</span>
              </p>
            )}
          </div>
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (optionnel)"
            className="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2"
          />
          <div className="flex gap-3">
            <button
              onClick={enregistrerRdv}
              disabled={!patientId}
              className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700 disabled:opacity-40"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setFormVisible(false)}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Formulaire de modification */}
      {rdvModif && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-3">
          <h2 className="font-semibold">
            Modifier le rendez-vous — {rdvModif.prenomsPatient} {rdvModif.nomPatient}
          </h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Heure</label>
              <select
                value={modifHeure}
                onChange={(e) => setModifHeure(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
              >
                {creneauxDuJour().map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Durée</label>
              <select
                value={modifDuree}
                onChange={(e) => setModifDuree(parseInt(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
              >
                {DUREES.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-sm text-slate-500 mb-1">Motif</label>
              <input
                value={modifMotif}
                onChange={(e) => setMotifModif(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={enregistrerModification}
              className="bg-lavande-600 text-white px-4 py-2 rounded-lg hover:bg-lavande-700"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setRdvModif(null)}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Confirmation de suppression */}
      {rdvSuppression && (
        <div className="bg-white rounded-xl border border-red-200 p-5 mb-6 space-y-3">
          <h2 className="font-semibold text-red-700">
            Supprimer le rendez-vous de {rdvSuppression.prenomsPatient}{" "}
            {rdvSuppression.nomPatient} ?
          </h2>
          <p className="text-sm text-slate-500">
            {new Date(rdvSuppression.debut).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — cette action est définitive.
          </p>
          <div className="flex gap-3">
            <button
              onClick={supprimer}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              Supprimer
            </button>
            <button
              onClick={() => setRdvSuppression(null)}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-nuit-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {erreur && <p className="text-sm text-red-600 mb-4">Erreur : {erreur}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {creneauxDuJour().map((hhmm) => {
          const rdv = rdvPourHeure(hhmm);
          return (
            <div
              key={hhmm}
              className="flex border-t border-nuit-100 first:border-t-0"
            >
              <div className="w-20 px-4 py-3 text-sm text-slate-500 border-r border-nuit-100">
                {hhmm}
              </div>
              {rdv ? (
                <div className="flex-1 px-4 py-3 flex items-center justify-between bg-lavande-50">
                  <div>
                    <button
                      onClick={() => navigate(`/patients/${rdv.patientId}`)}
                      className="font-semibold text-lavande-800 hover:underline"
                    >
                      {rdv.prenomsPatient} {rdv.nomPatient}
                    </button>
                    {rdv.motif && (
                      <span className="ml-2 text-sm text-slate-500">
                        — {rdv.motif}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs items-center">
                    <span
                      className={`px-2 py-1 rounded-full font-medium ${
                        rdv.statut === "ARRIVE"
                          ? "bg-amber-100 text-amber-700"
                          : rdv.statut === "HONORE"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-nuit-100 text-slate-500"
                      }`}
                    >
                      {rdv.statut}
                    </span>
                    {rdv.statut === "PLANIFIE" && (
                      <button
                        onClick={() => changerStatut(rdv, "ARRIVE")}
                        className="bg-emerald-600 text-white px-3 py-1 rounded-full hover:bg-emerald-700"
                      >
                        Arrivé
                      </button>
                    )}
                    {rdv.statut === "ARRIVE" && (
                      <button
                        onClick={() => changerStatut(rdv, "HONORE")}
                        className="bg-lavande-600 text-white px-3 py-1 rounded-full hover:bg-lavande-700"
                      >
                        Terminé
                      </button>
                    )}
                    <button
                      onClick={() => ouvrirModification(rdv)}
                      className="bg-white border border-slate-300 px-3 py-1 rounded-full hover:bg-nuit-100"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => setRdvSuppression(rdv)}
                      className="bg-white border border-red-300 text-red-600 px-3 py-1 rounded-full hover:bg-red-50"
                    >
                      🗑 Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => ouvrirCreation(hhmm)}
                  className="flex-1 px-4 py-3 text-left text-sm text-slate-300 hover:bg-lavande-50 hover:text-lavande-600"
                >
                  + libre
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
