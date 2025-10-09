import React, { useEffect, useMemo, useState } from "react";
import { adminListBookings, adminDeleteBooking, printUrl } from "../lib/api";

export default function AdminDashboard() {
  const [bookings, setBookings] = useState([]);
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState("");     // YYYY-MM-DD
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await adminListBookings({ from, to });
      setBookings(data);
    } catch (e) {
      console.error(e);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // init

  const csvHref = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString() ? `?${p.toString()}` : "";
    return `/api/bookings.csv${qs}`;
  }, [from, to]);

  async function onDelete(b) {
    const reason = prompt("Stornogrund (Pflichtfeld):");
    if (reason == null) return;
    if (!reason.trim()) return alert("Stornogrund ist erforderlich.");

    try {
      await adminDeleteBooking(b.id, reason);
      await load();
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Von</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          />
          <label className="ml-2 text-sm text-slate-600">Bis</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          />
          <button
            onClick={load}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Filtern
          </button>
          <button
            onClick={() => { setFrom(""); setTo(""); setTimeout(load, 0); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Reset
          </button>

          <a
            href={csvHref}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            CSV exportieren
          </a>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Lade…</p>
      ) : bookings.length === 0 ? (
        <p className="text-slate-500">Keine Einträge.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Uhrzeit</th>
                <th className="px-3 py-2">Dauer</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Adresse</th>
                <th className="px-3 py-2">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2">{b.date}</td>
                  <td className="px-3 py-2">{b.time}</td>
                  <td className="px-3 py-2">{b.duration} Min.</td>
                  <td className="px-3 py-2">{b.full_name}</td>
                  <td className="px-3 py-2">{b.email}</td>
                  <td className="px-3 py-2">{b.phone}</td>
                  <td className="px-3 py-2">
                    {b.address}{b.plz ? `, ${b.plz}` : ""}{b.city ? ` ${b.city}` : ""}
                  </td>
                  <td className="px-3 py-2 flex gap-2">
                    <a
                      href={printUrl(b.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                    >
                      Drucken
                    </a>
                    <button
                      onClick={() => onDelete(b)}
                      className="rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
