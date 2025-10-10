import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminLogin from "../components/AdminLogin";
import AdminDashboard from "../components/AdminDashboard";
import { authMe, authLogin, authLogout } from "../lib/api";

export default function LoginPage() {
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    authMe().then(r => setIsAdmin(!!r.admin)).catch(()=>setIsAdmin(false));
  }, []);

  async function handleLogin(u,p) {
    try {
      await authLogin(u,p);
      setIsAdmin(true);
    } catch {
      alert("Pogrešno korisničko ime ili lozinka.");
    }
  }

  async function handleLogout() {
    await authLogout();
    setIsAdmin(false);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        {/* <h1 className="text-2xl font-bold">Admin</h1>*/}
        <Link to="/kalendar" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50">
          ← Nazad na kalendar
        </Link>
      </div>

      {!isAdmin ? (
        <AdminLogin onLogin={handleLogin} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-700">Prijavljeni ste kao <b>admin</b>.</p>
            <div className="flex gap-2">
              <button onClick={()=>nav('/kalendar')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Idi na kalendar
              </button>
              <button onClick={handleLogout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Odjava
              </button>
            </div>
          </div>
          <AdminDashboard onLogout={handleLogout} />
        </div>
      )}
    </div>
  );
}
