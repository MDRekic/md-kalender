import React from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import KalendarPage from "./pages/KalendarPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  const loc = useLocation();
  const showNav = !["/login"].includes(loc.pathname);

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl">
        {/* Top bar / minimalna navigacija */}
        {showNav && (
          <header className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">MyDienst – Vizualni kalendar</h1>
              <p className="text-slate-600">
                Glasfaser Einblasen & Montage · ručni unos termina (puna kontrola).
              </p>
            </div>
            <nav className="flex gap-2">
              <Link
                to="/kalendar"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
              >
                Kalendar
              </Link>
              <Link
                to="/login"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
              >
                Admin
              </Link>
            </nav>
          </header>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/kalendar" replace />} />
          <Route path="/kalendar" element={<KalendarPage />} />
          <Route path="/login" element={<AdminPage />} />
          {/* fallback */}
          <Route path="*" element={<Navigate to="/kalendar" replace />} />
        </Routes>

        <footer className="mt-10 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} MyDienst GmbH · SQLite + email, CSV, Print
        </footer>
      </div>
    </div>
  );
}
