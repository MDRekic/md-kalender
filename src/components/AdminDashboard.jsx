// client/src/components/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import {
  adminListBookings,
  adminDeleteBooking,
  adminMarkDone,
  printUrl,
} from "../lib/api";

export default function AdminDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [activeRows, setActiveRows] = useState([]);
  const [doneRows, setDoneRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [act, done] = await Promise.all([
        adminListBookings({ from, to, status: "active" }),
        adminListBookings({ from, to, status: "done" }),
      ]);
      setActiveRows(act);
      setDoneRows(done);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetFilters() {
    setFrom("");
    setTo("");
    setTimeout(load, 0);
  }

  async function handleDelete(b) {
    const reason = prompt("Bitte Stornogrund eingeben (Pflichtfeld):");
    if (reason == null) return;
    if (!reason.trim()) return alert("Stornogrund ist erforderlich.");
    await adminDeleteBooking(b.id, reason);
    await load();
  }

  async function handleDone(b) {
    await adminMarkDone(b.id);
    await load();
  }

  function RowActions({ row }) {
    return (
      <div className="flex gap-2">
        <a
          href={printUrl(row.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Drucken
        </a>
        <button
          onClick={() => handleDone(row)}
          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"
          title="Als erledigt markieren"
        >
          Fertig
        </button>
        <button
          onClick={() => handleDelete(row)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Löschen
        </button>
      </div>
    );
  }

  function Table({ rows, showDoneActions = false }) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Datum</th>
              <th className="px-4 py-2 text-left">Uhrzeit</th>
              <th className="px-4 py-2 text-left">Dauer</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">E-Mail</th>
              <th className="px-4 py-2 text-left">Telefon</th>
              <th className="px-4 py-2 text-left">Adresse</th>
              <th className="px-4 py-2 text-left">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2">{r.time}</td>
                <td className="px-4 py-2">{r.duration} Min.</td>
                <td className="px-4 py-2">{r.full_name}</td>
                <td className="px-4 py-2">{r.email}</td>
                <td className="px-4 py-2">{r.phone}</td>
                <td className="px-4 py-2">
                  {r.address}
                  {r.plz ? `, ${r.plz}` : ""} {r.city || ""}
                </td>
                <td className="px-4 py-2">
                  {showDoneActions ? (
                    // U "done" tabeli nema "Fertig", samo “Drucken” (i po želji “Löschen”)
                    <div className="flex gap-2">
                      <a
                        href={printUrl(r.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        Drucken
                      </a>
                    </div>
                  ) : (
                    <RowActions row={r} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Admin – Reservierungen</h2>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Von"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Bis"
        />
        <button
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          Filtern
        </button>
        <button
          onClick={resetFilters}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Reset
        </button>
        <a
          href={`/api/bookings.csv`}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          CSV exportieren
        </a>
      </div>

      {/* Aktive */}
      <Table rows={activeRows} />

      {/* Erledigte */}
      <h3 className="mt-8 mb-3 text-base font-semibold">Erledigte Aufträge</h3>
      <Table rows={doneRows} showDoneActions />
    </div>
  );
}
