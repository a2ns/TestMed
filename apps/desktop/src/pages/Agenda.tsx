import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Patient, RendezVous } from "../lib/api";

const DEB = 8;
const FIN = 19;
const CRENEAU = 20;

function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Agenda() {
  const navigate = useNavigate();
  const [jour, setJour] = useState(dateLocale(new Date()));
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [creneau, setCreneau] = useState("");

  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientNom, setPatientNom] = useState("");
  const [motif, setMotif] = useState("");

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

  async function enregistrerRdv() {
    if (!patientId || !creneau) return;
    setErreur(null);
    try {
      const debutIso = new Date(`${jour}T${creneau}:00`).toISOString();
      await api.creerRdv(patientId, debutIso, CRENEAU, motif || null, null);
      setRdvs(await api.listRdvJour(jour));
      setFormVisible(false);
      setPatientId("");
      setPatientNom("");
      setRecherche("");
      setMotif("");
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function changerStatut(r: RendezVous, statut: string) {
    await api.changerStatutRdv(r.id, statut);
    setRdvs(await api.listRdvJour(jour));
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
                    className="block w-full text-left px-3 py-2 hover:bg-sky-50 text-sm"
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
              className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setFormVisible(false)}
              className="bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100"
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
              className="flex border-t border-slate-100 first:border-t-0"
            >
              <div className="w-20 px-4 py-3 text-sm text-slate-500 border-r border-slate-100">
                {hhmm}
              </div>
              {rdv ? (
                <div className="flex-1 px-4 py-3 flex items-center justify-between bg-sky-50">
                  <div>
                    <button
                      onClick={() => navigate(`/patients/${rdv.patientId}`)}
                      className="font-semibold text-sky-800 hover:underline"
                    >
                      {rdv.prenomsPatient} {rdv.nomPatient}
                    </button>
                    {rdv.motif && (
                      <span className="ml-2 text-sm text-slate-500">
                        — {rdv.motif}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    {rdv.statut === "PLANIFIE" && (
                      <>
                        <button
                          onClick={() => changerStatut(rdv, "ARRIVE")}
                          className="bg-emerald-600 text-white px-3 py-1 rounded-full hover:bg-emerald-700"
                        >
                          Arrivé
                        </button>
                        <button
                          onClick={() => changerStatut(rdv, "ANNULE")}
                          className="bg-white border border-slate-300 px-3 py-1 rounded-full hover:bg-slate-100"
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {rdv.statut === "ARRIVE" && (
                      <button
                        onClick={() => changerStatut(rdv, "HONORE")}
                        className="bg-sky-600 text-white px-3 py-1 rounded-full hover:bg-sky-700"
                      >
                        Terminé
                      </button>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full font-medium ${
                        rdv.statut === "ARRIVE"
                          ? "bg-amber-100 text-amber-700"
                          : rdv.statut === "HONORE"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {rdv.statut}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setCreneau(hhmm);
                    setFormVisible(true);
                  }}
                  className="flex-1 px-4 py-3 text-left text-sm text-slate-300 hover:bg-sky-50 hover:text-sky-600"
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
