import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FolderOpen,
  Mail,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

const MENU = [
  { to: "/", label: "Aujourd'hui", Icone: LayoutDashboard, end: true },
  { to: "/agenda", label: "Agenda", Icone: CalendarDays, end: false },
  { to: "/patients", label: "Patients", Icone: Users, end: false },
  { to: "/ged", label: "GED", Icone: FolderOpen, end: false, badge: true },
  { to: "/courriers", label: "Courriers", Icone: Mail, end: false },
];

const MENU_ADMIN = [
  { to: "/journal", label: "Journal d'audit", Icone: ShieldCheck, end: false },
];

export default function Layout() {
  const { utilisateur, token, deconnexion } = useAuth();
  const navigate = useNavigate();
  const [aTrier, setATrier] = useState(0);

  useEffect(() => {
    if (!token) return;
    let actif = true;
    const rafraichir = () =>
      api
        .compterATrier(token)
        .then((n) => actif && setATrier(n))
        .catch(() => undefined);
    rafraichir();
    const timer = setInterval(rafraichir, 15000);
    return () => {
      actif = false;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="flex h-screen">
      <aside className="w-60 bg-nuit-950 text-slate-200 flex flex-col">
        <div className="px-5 py-5 text-xl font-bold text-white tracking-tight">
          Magic<span className="text-lavande-400">Med</span>
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
                    ? "bg-lavande-600 text-white font-medium"
                    : "hover:bg-nuit-800"
                }`
              }
            >
              <m.Icone size={18} strokeWidth={2} />
              <span className="flex-1">{m.label}</span>
              {m.badge && aTrier > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-5 text-center">
                  {aTrier}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-nuit-800 px-3 py-2">
          <NavLink
            to="/systeme"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-nuit-800 text-slate-400"
          >
            <Settings size={18} strokeWidth={2} /> Système
          </NavLink>
          {utilisateur?.role === "ADMIN" && MENU_ADMIN.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-nuit-800 text-slate-400"
            >
              <m.Icone size={18} strokeWidth={2} /> {m.label}
            </NavLink>
          ))}
        </div>
        <div className="border-t border-nuit-800 px-5 py-4">
          <div className="text-sm text-slate-200 font-medium truncate">
            {utilisateur?.prenoms} {utilisateur?.nom}
          </div>
          <div className="text-xs text-slate-400 mb-3">{utilisateur?.role}</div>
          <button
            onClick={() => {
              deconnexion();
              navigate("/");
            }}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
          >
            <LogOut size={14} strokeWidth={2} /> Se déconnecter
          </button>
        </div>
        <div className="px-5 py-2 text-xs text-nuit-500">v0.1.0 — refonte</div>
      </aside>
      <main className="flex-1 overflow-auto bg-nuit-50">
        <Outlet />
      </main>
    </div>
  );
}
