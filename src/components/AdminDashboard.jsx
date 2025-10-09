// client/src/components/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import { adminListBookings, adminDeleteBooking, printUrl } from "../lib/api";

export default function AdminDashboard({ onAfterChange }) {
  const [rows, setRows] = useState([]);

  async function load() {
    try {
      const data = await adminListBookings();
      setRows(data);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(b) {
    const reason = prompt("Bitte Stornogrund eingeben (Pflichtfeld):");
    if (reason == null) return;          // cancel
    if (!reason.trim()) {
      alert("Stornogrund ist erforderlich.");
      return;
    }
    try {
      await adminDeleteBooking(b.id, reason);
      await load();                       // osvježi listu rezervacija
      onAfterChange?.();                  // obavijesti roditelja da osvježi slotove
    } catch (e) {
      alert("Löschen fehlgeschlagen: " + (e.message || e));
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>
        <a
          href="/api/bookings.csv"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          CSV exportieren
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-2">Datum</th>
              <th className="p-2">Uhrzeit</th>
              <th className="p-2">Dauer</th>
              <th className="p-2">Name</th>
              <th className="p-2">E-Mail</th>
              <th className="p-2">Telefon</th>
              <th className="p-2">Adresse</th>
              <th className="p-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-2">{b.date}</td>
                <td className="p-2">{b.time}</td>
                <td className="p-2">{b.duration} Min.</td>
                <td className="p-2">{b.full_name}</td>
                <td className="p-2">
                  <a className="text-sky-700" href={`mailto:${b.email}`}>{b.email}</a>
                </td>
                <td className="p-2">{b.phone}</td>
                <td className="p-2">
                  {b.address}{b.plz ? `, ${b.plz}` : ""}{b.city ? ` ${b.city}` : ""}
                </td>
                <td className="p-2 flex gap-2">
                  <a
                    className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                    href={printUrl(b.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Drucken
                  </a>
                  <button
                    onClick={() => handleDelete(b)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={8}>
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
