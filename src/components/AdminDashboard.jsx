import React, { useEffect, useState } from "react";
import {
  adminListOpen, adminListCompleted, adminListCanceled,
  adminCompleteBooking, adminDeleteBooking
} from "../lib/api";
import { printUrl } from "../lib/api";

function DateInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-600">{label}</label>
      <input
        className="w-40 rounded-lg border border-slate-300 px-2 py-1.5"
        placeholder="tt.mm.jjjj"
        value={value}
        onChange={(e)=>onChange(e.target.value)}
      />
    </div>
  );
}

export default function AdminDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [open, setOpen] = useState([]);
  const [done, setDone] = useState([]);
  const [canceled, setCanceled] = useState([]);
  const [err, setErr] = useState("");

  async function reload() {
    setErr("");
    try {
      const [a,b,c] = await Promise.all([
        adminListOpen({from,to}),
        adminListCompleted({from,to}),
        adminListCanceled({from,to}),
      ]);
      setOpen(a); setDone(b); setCanceled(c);
    } catch (e) {
      console.error(e);
      setErr("Fehler beim Laden der Listen.");
      setOpen([]); setDone([]); setCanceled([]);
    }
  }

  useEffect(()=>{ reload(); },[]);

  async function onComplete(b) {
    try {
      await adminCompleteBooking(b.id);
      await reload();
    } catch (e) {
      console.error(e);
      alert("Fertig markieren fehlgeschlagen.");
    }
  }

  async function onDelete(b) {
    const r = prompt("Stornogrund (Pflichtfeld):");
    if (r == null) return;
    if (!r.trim()) return alert("Grund ist erforderlich.");
    try {
      await adminDeleteBooking(b.id, r.trim());
      await reload();
    } catch (e) {
      console.error(e);
      alert("Löschen (Storno) fehlgeschlagen.");
    }
  }

  const Row = ({b, actions=true}) => (
    <tr className="border-t">
      <td className="py-2 pr-2">{b.date}</td>
      <td className="py-2 pr-2">{b.time} · {b.duration} Min.</td>
      <td className="py-2 pr-2">{b.full_name}</td>
      <td className="py-2 pr-2">
        {b.email}<br/>{b.phone}
      </td>
      <td className="py-2 pr-2">
        {b.address}{b.plz?`, ${b.plz}`:''}{b.city?` ${b.city}`:''}
      </td>
      <td className="py-2 pr-2">{b.note || "—"}</td>
      {actions && (
        <td className="py-2 pr-2">
          <div className="flex gap-2">
            <a
              href={printUrl(b.id)}
              target="_blank" rel="noreferrer"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Drucken
            </a>
            <button
              onClick={()=>onComplete(b)}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Fertig
            </button>
            <button
              onClick={()=>onDelete(b)}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Löschen
            </button>
          </div>
        </td>
      )}
    </tr>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Admin – Reservierungen</h2>

      <div className="mb-3 flex items-end gap-2">
        <DateInput label="Von" value={from} onChange={setFrom}/>
        <DateInput label="Bis" value={to} onChange={setTo}/>
        <button onClick={reload} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Filtern</button>
      </div>

      {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{err}</p>}

      <h3 className="mt-3 font-semibold">Offene Aufträge</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 pr-2">Datum</th>
              <th className="py-1 pr-2">Zeit</th>
              <th className="py-1 pr-2">Kunde</th>
              <th className="py-1 pr-2">Kontakt</th>
              <th className="py-1 pr-2">Adresse</th>
              <th className="py-1 pr-2">Notiz</th>
              <th className="py-1 pr-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {open.length ? open.map(b => <Row key={b.id} b={b} />)
                        : <tr><td className="py-2 text-slate-500" colSpan={7}>Keine offenen Aufträge im Zeitraum.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-semibold">Erledigte Aufträge</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 pr-2">Datum</th>
              <th className="py-1 pr-2">Zeit</th>
              <th className="py-1 pr-2">Kunde</th>
              <th className="py-1 pr-2">Kontakt</th>
              <th className="py-1 pr-2">Adresse</th>
              <th className="py-1 pr-2">Notiz</th>
              <th className="py-1 pr-2">Erledigt von</th>
            </tr>
          </thead>
          <tbody>
            {done.length ? done.map(b => (
              <tr key={b.id} className="border-t">
                <td className="py-2 pr-2">{b.date}</td>
                <td className="py-2 pr-2">{b.time} · {b.duration} Min.</td>
                <td className="py-2 pr-2">{b.full_name}</td>
                <td className="py-2 pr-2">{b.email}<br/>{b.phone}</td>
                <td className="py-2 pr-2">{b.address}{b.plz?`, ${b.plz}`:''}{b.city?` ${b.city}`:''}</td>
                <td className="py-2 pr-2">{b.note || "—"}</td>
                <td className="py-2 pr-2">{b.completed_by} (ID {b.completed_by_id})</td>
              </tr>
            )) : <tr><td className="py-2 text-slate-500" colSpan={7}>Keine erledigten Aufträge im Zeitraum.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-semibold">Storno Aufträge</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-1 pr-2">Datum</th>
              <th className="py-1 pr-2">Zeit</th>
              <th className="py-1 pr-2">Kunde</th>
              <th className="py-1 pr-2">Kontakt</th>
              <th className="py-1 pr-2">Adresse</th>
              <th className="py-1 pr-2">Grund</th>
              <th className="py-1 pr-2">Storniert von</th>
            </tr>
          </thead>
          <tbody>
            {canceled.length ? canceled.map(b => (
              <tr key={b.id} className="border-t">
                <td className="py-2 pr-2">{b.date}</td>
                <td className="py-2 pr-2">{b.time} · {b.duration} Min.</td>
                <td className="py-2 pr-2">{b.full_name}</td>
                <td className="py-2 pr-2">{b.email}<br/>{b.phone}</td>
                <td className="py-2 pr-2">{b.address}{b.plz?`, ${b.plz}`:''}{b.city?` ${b.city}`:''}</td>
                <td className="py-2 pr-2">{b.reason}</td>
                <td className="py-2 pr-2">{b.canceled_by} (ID {b.canceled_by_id})</td>
              </tr>
            )) : <tr><td className="py-2 text-slate-500" colSpan={7}>Keine stornierten Aufträge im Zeitraum.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
