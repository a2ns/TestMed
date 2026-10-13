import { NavLink, Outlet } from "react-router-dom";

const MENU = [
  { to: "/", label: "Tableau de bord", icone: "📊", end: true },
  { to: "/patients", label: "Patients", icone: "👤", end: false },
  { to: "/ged", label: "GED", icone: "🗂️", end: false },
  { to: "/courriers", label: "Courriers", icone: "✉️", end: false },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-5 text-xl font-bold text-white tracking-tight">
          Magic<span className="text-sky-400">Med</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                  isActive
                    ? "bg-sky-600 text-white font-medium"
                    : "hover:bg-slate-800"
                }`
              }
            >
              <span>{m.icone}</span> {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-slate-500">v0.1.0 — refonte</div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
