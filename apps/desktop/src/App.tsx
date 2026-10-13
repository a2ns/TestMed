import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Agenda from "./pages/Agenda";
import Ged from "./pages/Ged";
import Courriers from "./pages/Courriers";
import Journal from "./pages/Journal";
import FichePatient from "./pages/FichePatient";
import Ordonnance from "./pages/Ordonnance";
import NouveauPatient from "./pages/NouveauPatient";

function AppProtegee() {
  const { utilisateur } = useAuth();
  if (!utilisateur) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/nouveau" element={<NouveauPatient />} />
        <Route path="patients/:id" element={<FichePatient />} />
        <Route path="patients/:id/ordonnance" element={<Ordonnance />} />
        <Route path="ged" element={<Ged />} />
        <Route path="journal" element={<Journal />} />
        <Route path="courriers" element={<Courriers />} />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
