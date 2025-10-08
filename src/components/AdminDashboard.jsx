import React, { useEffect, useState } from "react";
import { listBookingsAdmin, deleteBookingAdmin, csvUrl, authLogout } from "../lib/api";

export default function AdminDashboard({ onLogout }) {
  const [rows, setRows] = useState([]);

  const load = () => listBookingsAdmin().then(setRows).catch(() => setRows([]));
  useEffect(load, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>
        <div className="flex items-center gap-2">
          <a
            href={csvUrl()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            CSV exportieren
          </a>
          <button
            onClick={() => authLogout().then(onLogout)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Abmelden
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-600">
            <tr>
              <th className="py-2 pr-4">Datum</th>
              <th className="py-2 pr-4">Uhrzeit</th>
              <th className="py-2 pr-4">Dauer</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">E-Mail</th>
              <th className="py-2 pr-4">Telefon</th>
              <th className="py-2 pr-4">Adresse</th> {/* NEW */}
              <th className="py-2 pr-4">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 pr-4">{r.date}</td>
                <td className="py-2 pr-4">{r.time}</td>
                <td className="py-2 pr-4">{r.duration} Min.</td>
                <td className="py-2 pr-4">{r.full_name}</td>
                <td className="py-2 pr-4">{r.email}</td>
                <td className="py-2 pr-4">{r.phone || "-"}</td>
                <td className="py-2 pr-4 break-words max-w-xs">{r.address || "-"}</td> {/* NEW */}
                <td className="py-2 pr-4">
                  <button
                    onClick={() => deleteBookingAdmin(r.id).then(load)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-slate-500" colSpan={8}>
                  Keine Reservierungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
