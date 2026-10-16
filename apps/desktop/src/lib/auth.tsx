import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, Utilisateur } from "./api";

type AuthContexte = {
  utilisateur: Utilisateur | null;
  token: string | null;
  connexion: (identifiant: string, motDePasse: string) => Promise<void>;
  deconnexion: () => void;
};

const Ctx = createContext<AuthContexte | null>(null);

const CLE_TOKEN = "primia-token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    const stocke = localStorage.getItem(CLE_TOKEN);
    if (!stocke) {
      setPret(true);
      return;
    }
    api
      .utilisateurCourant(stocke)
      .then((u) => {
        setToken(stocke);
        setUtilisateur(u);
      })
      .catch(() => localStorage.removeItem(CLE_TOKEN))
      .finally(() => setPret(true));
  }, []);

  const connexion = useCallback(async (identifiant: string, motDePasse: string) => {
    const t = await api.connexion(identifiant, motDePasse);
    const u = await api.utilisateurCourant(t);
    localStorage.setItem(CLE_TOKEN, t);
    setToken(t);
    setUtilisateur(u);
  }, []);

  const deconnexion = useCallback(() => {
    if (token) api.deconnexion(token).catch(() => undefined);
    localStorage.removeItem(CLE_TOKEN);
    setToken(null);
    setUtilisateur(null);
  }, [token]);

  return (
    <Ctx.Provider value={{ utilisateur, token, connexion, deconnexion }}>
      {pret ? children : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth hors AuthProvider");
  return ctx;
}
