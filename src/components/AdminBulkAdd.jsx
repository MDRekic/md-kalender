import React, { useMemo, useState } from "react";
import { ymd } from "../lib/date";

/**
 * AdminBulkAdd – dodavanje termina za više dana po pravilima (od-do + dani u sedmici).
 * Poziva parent onSubmit({ dates, time, duration }).
 */
export default function AdminBulkAdd({ selectedDate, onSubmit }) {
  // default: od izabranog dana do kraja mjeseca
  const first = useMemo(() => selectedDate, [selectedDate]);
  const last = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setMonth(d.getMonth() + 1, 0); // zadnji dan mjeseca
    return ymd(d);
  }, [selectedDate]);

  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [time, setTime] = useState("08:00");
  const [duration, setDuration] = useState(120);

  // Mo..So (JS getDay(): 0=So,1=Mo,...6=Sa)
  const [wd, setWd] = useState({
    1: true, // Mo
    2: true, // Di
    3: true, // Mi
    4: true, // Do
    5: true, // Fr
    6: false, // Sa
    0: false, // So
  });

  function toggle(day) {
    setWd((p) => ({ ...p, [day]: !p[day] }));
  }

  function buildDates() {
    if (!from || !to) return [];
    const out = [];
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay(); // 0..6
      if (wd[day]) out.push(ymd(d));
    }
    return out;
  }

  function submit(e) {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      alert("Uhrzeit im Format HH:MM (z. B. 08:10).");
      return;
    }
    const dates = buildDates();
    if (dates.length === 0) {
      alert("Odaberite barem jedan dan u sedmici u zadanom periodu.");
      return;
    }
    onSubmit({ dates, time, duration: Number(duration) || 120 });
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold">Mehrere Termine hinzufügen</h3>

      <div className="flex flex-wrap items-end gap-3">
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
        <div>
          <label className="block text-xs text-slate-600">Uhrzeit (HH:MM)</label>
          <input
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Dauer (Min.)</label>
          <input
            type="number"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
            value={duration}
            min={5}
            step={5}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            ["Mo", 1],
            ["Di", 2],
            ["Mi", 3],
            ["Do", 4],
            ["Fr", 5],
            ["Sa", 6],
            ["So", 0],
          ].map(([label, d]) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={!!wd[d]}
                onChange={() => toggle(d)}
              />
              {label}
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
        >
          Anlegen
        </button>
      </div>
    </form>
  );
}
