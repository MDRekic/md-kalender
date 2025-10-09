import React, { useEffect, useState, useCallback } from "react";
import {
  adminListBookings,
  adminDeleteBooking,
  adminCompleteBooking,
  printUrl,
} from "../lib/api";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(false);
  const [openBookings, setOpenBookings] = useState([]);
  const [doneBookings, setDoneBookings] = useState([]);

  // (opciono) filteri po datumu — možeš ih koristiti ili sakriti
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchOpen = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await adminListBookings({ from, to, done: 0 });
      setOpenBookings(rows || []);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const fetchDone = useCallback(async () => {
    try {
      const rows = await adminListBookings({ from, to, done: 1 });
      setDoneBookings(rows || []);
    } catch {
      // ignore
    }
  }, [from, to]);

  const reloadLists = useCallback(async () => {
    await Promise.all([fetchOpen(), fetchDone()]);
  }, [fetchOpen, fetchDone]);

  useEffect(() => {
    reloadLists();
  }, [reloadLists]);

  async function onDelete(b) {
    const reason = prompt("Bitte Stornogrund eingeben (Pflichtfeld):");
    if (reason == null) return; // cancel
    if (!reason.trim()) {
      alert("Stornogrund ist erforderlich.");
      return;
    }
    try {
      await adminDeleteBooking(b.id, reason);
      await reloadLists();
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  async function onComplete(b) {
    try {
      await adminCompleteBooking(row.id);
      await reloadLists();
    } catch (e) {
      console.error(e);
      alert("Fertig markieren fehlgeschlagen.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>

        {/* Filteri (opciono) */}
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-600">Von (YYYY-MM-DD)</label>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-2 py-1.5"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Bis (YYYY-MM-DD)</label>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-2 py-1.5"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            onClick={reloadLists}
            className="h-[38px] rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
          >
            Filtern
          </button>
        </div>
      </div>

      {/* Otvorene rezervacije */}
      <div className="mb-6">
        <h3 className="mb-2 text-base font-semibold">Offene Reservierungen</h3>
        {loading ? (
          <p className="text-slate-500">Lade…</p>
        ) : openBookings.length === 0 ? (
          <p className="text-slate-500">Keine offenen Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-2 py-2 text-left">Datum</th>
                  <th className="px-2 py-2 text-left">Zeit</th>
                  <th className="px-2 py-2 text-left">Kunde</th>
                  <th className="px-2 py-2 text-left">Kontakt</th>
                  <th className="px-2 py-2 text-left">Adresse</th>
                  <th className="px-2 py-2 text-left">Notiz</th>
                  <th className="px-2 py-2 text-left w-[210px]">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {openBookings.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="px-2 py-2">{b.date}</td>
                    <td className="px-2 py-2">{b.time} · {b.duration} Min.</td>
                    <td className="px-2 py-2">{b.full_name}</td>
                    <td className="px-2 py-2">
                      <div>{b.email}</div>
                      {b.phone ? <div className="text-slate-500">{b.phone}</div> : null}
                    </td>
                    <td className="px-2 py-2">
                      {b.address}
                      {b.plz || b.city ? (
                        <div className="text-slate-500">
                          {b.plz} {b.city}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{b.note || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={printUrl(b.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                        >
                          Drucken
                        </a>
                        <button
                          onClick={() => onDelete(b)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                        >
                          Löschen
                        </button>
                        <button
                          onClick={() => onComplete(b)}
                          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50"
                        >
                          Fertig
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Erledigte Aufträge */}
      <div>
        <h3 className="mb-2 text-base font-semibold">Erledigte Aufträge</h3>
        {doneBookings.length === 0 ? (
          <p className="text-slate-500">Keine erledigten Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-2 py-2 text-left">Datum</th>
                  <th className="px-2 py-2 text-left">Zeit</th>
                  <th className="px-2 py-2 text-left">Kunde</th>
                  <th className="px-2 py-2 text-left">Kontakt</th>
                  <th className="px-2 py-2 text-left">Adresse</th>
                  <th className="px-2 py-2 text-left">Erledigt von</th>
                  <th className="px-2 py-2 text-left">Erledigt am</th>
                </tr>
              </thead>
              <tbody>
                {doneBookings.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="px-2 py-2">{b.date}</td>
                    <td className="px-2 py-2">{b.time} · {b.duration} Min.</td>
                    <td className="px-2 py-2">{b.full_name}</td>
                    <td className="px-2 py-2">
                      <div>{b.email}</div>
                      {b.phone ? <div className="text-slate-500">{b.phone}</div> : null}
                    </td>
                    <td className="px-2 py-2">
                      {b.address}
                      {b.plz || b.city ? (
                        <div className="text-slate-500">
                          {b.plz} {b.city}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{b.completed_by_name || "—"}</td>
                    <td className="px-2 py-2">{b.completed_at || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
