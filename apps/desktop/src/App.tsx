import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import PaletteRecherche from "./components/PaletteRecherche";
import Login from "./pages/Login";
import Aujourdhui from "./pages/Aujourdhui";
import Patients from "./pages/Patients";
import Agenda from "./pages/Agenda";
import Ged from "./pages/Ged";
import Courriers from "./pages/Courriers";
import Reconciliation from "./pages/Reconciliation";
import Journal from "./pages/Journal";
import Systeme from "./pages/Systeme";
import FichePatient from "./pages/FichePatient";
import Ordonnance from "./pages/Ordonnance";
import NouveauPatient from "./pages/NouveauPatient";

function AppProtegee() {
  const { utilisateur } = useAuth();
  if (!utilisateur) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Aujourdhui />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/nouveau" element={<NouveauPatient />} />
        <Route path="patients/:id" element={<FichePatient />} />
        <Route path="patients/:id/ordonnance" element={<Ordonnance />} />
        <Route path="ged" element={<Ged />} />
        <Route path="journal" element={<Journal />} />
        <Route path="systeme" element={<Systeme />} />
        <Route path="courriers" element={<Courriers />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppProtegee />
        <PaletteRecherche />
      </BrowserRouter>
    </AuthProvider>
  );
}
