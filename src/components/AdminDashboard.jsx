import React, { useEffect, useMemo, useState } from "react";
import {
  adminListBookings,
  adminDeleteBooking,
  adminCompleteBooking,
  printUrl,
} from "../lib/api";

// pomoćno: lijepo formatiranje
function fmtPhone(s) {
  return s || "";
}
function fmtAddr(b) {
  const a = [b.address, [b.plz, b.city].filter(Boolean).join(" ")].filter(Boolean);
  return a.join(", ");
}
function ymdToDe(s) {
  // "2025-10-08" -> "08.10.2025"
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}
function deToYmd(s) {
  // prihvati "tt.mm.jjjj" ili "yyyy-mm-dd"
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

const [canceled, setCanceled] = useState([]);

async function reloadLists() {
  // ...već imaš fetch za open + completed
  const [openL, doneL, cancL] = await Promise.all([
    adminListBookings({ status: 'open', from, to }),      // primjer, zavisi od tvoje implementacije
    adminListCompleted({ from, to }),                      // ako imaš posebnu rutu
    adminListCancellations({ from, to })
  ]);
  setOpen(openL);
  setCompleted(doneL);
  setCanceled(cancL);
}


export default function AdminDashboard() {
  const [fromDe, setFromDe] = useState(""); // prikaz u inputu (može ostati prazan)
  const [toDe, setToDe] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchBookings({ from, to } = {}) {
    setLoading(true);
    try {
      const data = await adminListBookings({
        from: from || undefined,
        to: to || undefined,
      });
      setRows(data || []);
    } catch (e) {
      console.error(e);
      alert("Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  function resetFilters() {
    setFromDe("");
    setToDe("");
    fetchBookings();
  }

  async function onFilter() {
    const from = deToYmd(fromDe);
    const to = deToYmd(toDe);
    await fetchBookings({ from: from || undefined, to: to || undefined });
  }

  function csvExport() {
    window.open("/api/bookings.csv", "_blank");
  }

  async function handleDelete(b) {
    const reason = prompt("Bitte Stornogrund eingeben (Pflichtfeld):");
    if (reason == null) return; // Cancel
    if (!reason.trim()) return alert("Stornogrund ist erforderlich.");
    try {
      await adminDeleteBooking(b.id, reason);
      await fetchBookings({
        from: deToYmd(fromDe) || undefined,
        to: deToYmd(toDe) || undefined,
      });
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  async function handleComplete(b) {
    try {
      await adminCompleteBooking(b.id);
      await fetchBookings({
        from: deToYmd(fromDe) || undefined,
        to: deToYmd(toDe) || undefined,
      });
    } catch (e) {
      console.error(e);
      if (String(e?.message || "").includes("unauthorized")) {
        alert("Fertig markieren fehlgeschlagen (Session?).");
      } else {
        alert("Fertig markieren fehlgeschlagen.");
      }
    }
  }

  const openRows = useMemo(
    () => rows.filter((r) => !r.completed_at),
    [rows]
  );
  const doneRows = useMemo(
    () => rows.filter((r) => !!r.completed_at),
    [rows]
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Admin – Reservierungen</h2>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-600">Von (YYYY-MM-DD)</label>
            <input
              className="w-36 rounded-lg border border-slate-300 px-2 py-1.5"
              placeholder="tt.mm.jjjj"
              value={fromDe}
              onChange={(e) => setFromDe(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Bis (YYYY-MM-DD)</label>
            <input
              className="w-36 rounded-lg border border-slate-300 px-2 py-1.5"
              placeholder="tt.mm.jjjj"
              value={toDe}
              onChange={(e) => setToDe(e.target.value)}
            />
          </div>
          <button
            onClick={onFilter}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Filtern
          </button>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            onClick={csvExport}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            CSV exportieren
          </button>
        </div>
      </div>

      {/* Otvorene rezervacije */}
      <h3 className="mb-2 mt-4 font-medium">Offene Reservierungen</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="p-2">Datum</th>
              <th className="p-2">Zeit</th>
              <th className="p-2">Dauer</th>
              <th className="p-2">Kunde</th>
              <th className="p-2">Kontakt</th>
              <th className="p-2">Adresse</th>
              <th className="p-2">Notiz</th>
              <th className="p-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-2" colSpan={8}>
                  Lädt…
                </td>
              </tr>
            )}
            {!loading && openRows.length === 0 && (
              <tr>
                <td className="p-2 text-slate-500" colSpan={8}>
                  Keine offenen Reservierungen.
                </td>
              </tr>
            )}
            {!loading &&
              openRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{r.time}</td>
                  <td className="p-2">{r.duration} Min.</td>
                  <td className="p-2">{r.full_name}</td>
                  <td className="p-2">
                    <div>{r.email}</div>
                    <div className="text-slate-500">{fmtPhone(r.phone)}</div>
                  </td>
                  <td className="p-2">{fmtAddr(r)}</td>
                  <td className="p-2 truncate max-w-[240px]">{r.note || "—"}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(printUrl(r.id), "_blank")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        Drucken
                      </button>
                      <button
                        onClick={() => handleComplete(r)}
                        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"
                      >
                        Fertig
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Završeni */}
      <h3 className="mb-2 mt-8 font-medium">Erledigte Aufträge</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="p-2">Datum</th>
              <th className="p-2">Zeit</th>
              <th className="p-2">Dauer</th>
              <th className="p-2">Kunde</th>
              <th className="p-2">Kontakt</th>
              <th className="p-2">Adresse</th>
              <th className="p-2">Erledigt von</th>
              <th className="p-2">Erledigt am</th>
              <th className="p-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-2" colSpan={9}>
                  Lädt…
                </td>
              </tr>
            )}
            {!loading && doneRows.length === 0 && (
              <tr>
                <td className="p-2 text-slate-500" colSpan={9}>
                  Keine erledigten Aufträge.
                </td>
              </tr>
            )}
            {!loading &&
              doneRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{r.time}</td>
                  <td className="p-2">{r.duration} Min.</td>
                  <td className="p-2">{r.full_name}</td>
                  <td className="p-2">
                    <div>{r.email}</div>
                    <div className="text-slate-500">{fmtPhone(r.phone)}</div>
                  </td>
                  <td className="p-2">{fmtAddr(r)}</td>
                  <td className="p-2">{r.completed_by || "—"}</td>
                  <td className="p-2">
                    {r.completed_at ? ymdToDe(r.completed_at.slice(0, 10)) : "—"}
                    {r.completed_at && r.completed_at.length > 10
                      ? " " + r.completed_at.slice(11, 16)
                      : ""}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => window.open(printUrl(r.id), "_blank")}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Drucken
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="mt-8">
  <h3 className="mb-2 text-lg font-semibold">Storno Aufträge</h3>

  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-slate-600">
          <th className="px-3 py-2 text-left">Datum</th>
          <th className="px-3 py-2 text-left">Zeit</th>
          <th className="px-3 py-2 text-left">Kunde</th>
          <th className="px-3 py-2 text-left">Kontakt</th>
          <th className="px-3 py-2 text-left">Adresse</th>
          <th className="px-3 py-2 text-left">Grund</th>
          <th className="px-3 py-2 text-left">Storniert von</th>
          <th className="px-3 py-2 text-left">Storniert am</th>
        </tr>
      </thead>
      <tbody>
        {canceled.length === 0 ? (
          <tr><td colSpan={8} className="px-3 py-4 text-slate-500">Keine stornierten Aufträge im Zeitraum.</td></tr>
        ) : canceled.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="px-3 py-2 whitespace-nowrap">{r.slot_date}</td>
            <td className="px-3 py-2 whitespace-nowrap">{r.slot_time} · {r.slot_duration} Min.</td>
            <td className="px-3 py-2">{r.full_name}</td>
            <td className="px-3 py-2">
              <div>{r.email}</div>
              {r.phone && <div className="text-slate-500">{r.phone}</div>}
            </td>
            <td className="px-3 py-2">{[r.address, r.plz, r.city].filter(Boolean).join(', ')}</td>
            <td className="px-3 py-2">{r.reason}</td>
            <td className="px-3 py-2">{r.canceled_by || '—'}</td>
            <td className="px-3 py-2">{r.canceled_at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>


      </div>
    </div>
  );
}
