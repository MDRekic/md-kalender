// src/components/AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  adminListBookings,
  adminListCompleted,
  adminListCancellations,
  adminDeleteBooking,
  adminCompleteBooking,
} from "../lib/api";
import { printUrl } from "../lib/api";

// helper za YYYY-MM-DD
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function AdminDashboard({ onLogout }) {
  // filteri
  const [from, setFrom] = useState(() => ymd(new Date(new Date().setDate(new Date().getDate() - 30))));
  const [to, setTo] = useState(() => ymd());

  // liste
  const [openList, setOpenList] = useState([]);
  const [completedList, setCompletedList] = useState([]);
  const [canceledList, setCanceledList] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const periodLabel = useMemo(() => {
    return `${from || "—"}  —  ${to || "—"}`;
  }, [from, to]);

  async function reloadLists() {
    setLoading(true);
    setErr("");
    try {
      const [openL, doneL, cancL] = await Promise.all([
        adminListBookings({ from, to }),         // otvorene / aktivne
        adminListCompleted({ from, to }),        // završene (Fertig)
        adminListCancellations({ from, to }),    // stornirane
      ]);
      setOpenList(openL || []);
      setCompletedList(doneL || []);
      setCanceledList(cancL || []);
    } catch (e) {
      console.error(e);
      setErr("Fehler beim Laden der Listen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(row) {
    const reason = window.prompt("Bitte Stornogrund eingeben (Pflichtfeld):");
    if (reason == null) return; // odustao
    if (!reason.trim()) {
      alert("Stornogrund ist erforderlich.");
      return;
    }
    try {
      await adminDeleteBooking(row.id, reason.trim());
      await reloadLists();
    } catch (e) {
      console.error(e);
      alert("Löschen (Storno) fehlgeschlagen.");
    }
  }

  async function handleComplete(row) {
    if (!window.confirm("Diesen Auftrag als erledigt markieren?")) return;
    try {
      await adminCompleteBooking(row.id);
      await reloadLists();
    } catch (e) {
      console.error(e);
      alert("Als erledigt markieren fehlgeschlagen.");
    }
  }

  function handlePrint(row) {
    window.open(printUrl(row.id), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>
          <div className="text-xs text-slate-500">Zeitraum: {periodLabel}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div>
            <label className="block text-xs text-slate-600">Von</label>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-2 py-1.5"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Bis</label>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-2 py-1.5"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            onClick={reloadLists}
            className="self-end rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          >
            Filtern
          </button>
        </div>
      </div>

      {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {loading && <div className="mb-3 text-sm text-slate-500">Lade …</div>}

      {/* Otvorene / aktivne rezervacije */}
      <section className="mb-8">
        <h3 className="mb-2 text-lg font-semibold">Offene Aufträge</h3>
        <div className="overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Zeit</th>
                <th className="px-3 py-2 text-left">Kunde</th>
                <th className="px-3 py-2 text-left">Kontakt</th>
                <th className="px-3 py-2 text-left">Adresse</th>
                <td className="px-3 py-2 whitespace-nowrap">
  {Number.isFinite(+row.units) ? row.units : '—'}
</td>
                <th className="px-3 py-2 text-left">Notiz</th>
                <th className="px-3 py-2 text-left">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {openList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    Keine offenen Aufträge im Zeitraum.
                  </td>
                </tr>
              ) : (
                openList.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.time} · {row.duration} Min.
                    </td>
                    <td className="px-3 py-2">{row.full_name}</td>
                    <td className="px-3 py-2">
                      <div>{row.email}</div>
                      {row.phone && <div className="text-slate-500">{row.phone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {[row.address, row.plz, row.city, row.units].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-3 py-2">{row.note || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handlePrint(row)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                        >
                          Drucken
                        </button>
                        <button
                          onClick={() => handleComplete(row)}
                          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"
                        >
                          Fertig
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Erledigte Aufträge */}
      <section className="mb-8">
        <h3 className="mb-2 text-lg font-semibold">Erledigte Aufträge</h3>
        <div className="overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Zeit</th>
                <th className="px-3 py-2 text-left">Kunde</th>
                <th className="px-3 py-2 text-left">Kontakt</th>
                <th className="px-3 py-2 text-left">Adresse</th>
                <td className="px-3 py-2 whitespace-nowrap">
  {Number.isFinite(+r.units) ? r.units : '—'}
</td>
                <th className="px-3 py-2 text-left">Notiz</th>
                <th className="px-3 py-2 text-left">Fertig von</th>
                <th className="px-3 py-2 text-left">Fertig am</th>
              </tr>
            </thead>
            <tbody>
              {completedList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-slate-500">
                    Keine erledigten Aufträge im Zeitraum.
                  </td>
                </tr>
              ) : (
                completedList.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.time} · {r.duration} Min.
                    </td>
                    <td className="px-3 py-2">{r.full_name}</td>
                    <td className="px-3 py-2">
                      <div>{r.email}</div>
                      {r.phone && <div className="text-slate-500">{r.phone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {[r.address, r.plz, r.city].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-3 py-2">{r.note || "—"}</td>
                    <td className="px-3 py-2">{r.completed_by || "—"}</td>
                    <td className="px-3 py-2">{r.completed_at || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Storno Aufträge */}
      <section>
        <h3 className="mb-2 text-lg font-semibold">Storno Aufträge</h3>
        <div className="overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Zeit</th>
                <th className="px-3 py-2 text-left">Kunde</th>
                <th className="px-3 py-2 text-left">Kontakt</th>
                <th className="px-3 py-2 text-left">Adresse</th>
                <td className="px-3 py-2 whitespace-nowrap"> {Number.isFinite(+r.units) ? r.units : '—'}</td>
                <th className="px-3 py-2 text-left">Grund</th>
                <th className="px-3 py-2 text-left">Storniert von</th>
                <th className="px-3 py-2 text-left">Storniert am</th>
              </tr>
            </thead>
            <tbody>
              {canceledList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-slate-500">
                    Keine stornierten Aufträge im Zeitraum.
                  </td>
                </tr>
              ) : (
                canceledList.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{r.slot_date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.slot_time} · {r.slot_duration} Min.
                    </td>
                    <td className="px-3 py-2">{r.full_name}</td>
                    <td className="px-3 py-2">
                      <div>{r.email}</div>
                      {r.phone && <div className="text-slate-500">{r.phone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {[r.address, r.plz, r.city].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="px-3 py-2">{r.canceled_by || "—"}</td>
                    <td className="px-3 py-2">{r.canceled_at || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
