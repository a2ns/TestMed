import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Ged from "./pages/Ged";
import Courriers from "./pages/Courriers";
import Reconciliation from "./pages/Reconciliation";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="ged" element={<Ged />} />
          <Route path="courriers" element={<Courriers />} />
          <Route path="reconciliation" element={<Reconciliation />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
