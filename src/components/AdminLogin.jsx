import React, { useState } from "react";

export default function AdminLogin({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Admin-Anmeldung</h2>
      <div className="flex flex-col gap-3 sm:w-80">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Benutzername"
          value={u}
          onChange={(e) => setU(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          type="password"
          placeholder="Passwort"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        <button
          onClick={() => onLogin(u, p)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
        >
          Anmelden
        </button>
      </div>
    </div>
  );
}
