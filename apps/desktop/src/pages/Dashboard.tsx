export default function Dashboard() {
  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Carte titre="Patients aujourd'hui" valeur="—" />
        <Carte titre="Documents non classés" valeur="—" />
        <Carte titre="Courriers en attente" valeur="—" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-semibold mb-2">Bienvenue dans Primia</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Primia — client lourd Tauri (Rust), PostgreSQL
          central, GED avec scan de masse et OCR, courriers assistés par IA.
        </p>
      </div>
    </div>
  );
}

function Carte({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-500">{titre}</div>
      <div className="text-3xl font-bold mt-2">{valeur}</div>
    </div>
  );
}
