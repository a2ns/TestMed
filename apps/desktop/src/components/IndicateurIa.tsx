import { Loader2 } from "lucide-react";

type Props = {
  actif: boolean;
  tache?: string;
  texte?: string;
};

/// Indicateur de travail IA : animation + message contextuel.
/// Affiché pendant que le modèle génère (tâche de fond).
export default function IndicateurIa({
  actif,
  tache = "génération",
  texte,
}: Props) {
  if (!actif) return null;
  const messages: Record<string, string> = {
    courrier: "Rédaction du courrier en cours — vous pouvez continuer la saisie…",
    reformulation: "Reformulation en cours…",
    structuration: "Structuration des notes en cours…",
    prescription: "Recherche de propositions de prescription…",
    analyse: "Analyse du document (OCR + IA)…",
    test: "Test de la connexion IA…",
    generation: "Génération en cours…",
  };
  return (
    <div className="flex items-center gap-3 bg-lavande-50 border border-lavande-200 rounded-xl px-4 py-3">
      <Loader2 size={18} className="animate-spin text-lavande-600" />
      <div className="text-sm">
        <p className="font-medium text-lavande-800">{texte ?? messages[tache] ?? messages.generation}</p>
        <p className="text-xs text-lavande-600 mt-0.5">
          IA locale — le brouillon apparaîtra ici dès qu'il est prêt
        </p>
      </div>
    </div>
  );
}
