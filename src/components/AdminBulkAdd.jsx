import React, { useMemo, useState } from "react";
import { createSlotsBulk } from "../lib/api";
import { ymd } from "../lib/date";

const DOW = [
  { id: 1, label: "Mo" },
  { id: 2, label: "Di" },
  { id: 3, label: "Mi" },
  { id: 4, label: "Do" },
  { id: 5, label: "Fr" },
  { id: 6, label: "Sa" },
  { id: 7, label: "So" },
];

export default function AdminBulkAdd({ selectedDate, activeDate, onDone }) {
  const [time, setTime] = useState("08:00");
  const [duration, setDuration] = useState(120);
  const [from, setFrom] = useState(selectedDate || ymd(new Date()));
  const [to, setTo] = useState(selectedDate || ymd(new Date()));
  const [days, setDays] = useState(new Set([1,2,3,4,5])); // default: radni dani
  const [busy, setBusy] = useState(false);

  const lastDayOfActiveMonth = useMemo(() => {
    if (!activeDate) return ymd(new Date());
    const d = new Date(activeDate);
    d.setMonth(d.getMonth() + 1, 0); // last day in month
    return ymd(d);
  }, [activeDate]);

  function toggleDay(id) {
    const s = new Set(days);
    if (s.has(id)) s.delete(id); else s.add(id);
    setDays(s);
  }

  async function submit() {
    if (!/^\d{2}:\d{2}$/.test(time)) return alert("Uhrzeit im Format HH:MM.");
    if (!from || !to) return alert("Bitte Zeitraum wählen.");
    if (days.size === 0) return alert("Mindestens ein Wochentag wählen.");

    setBusy(true);
    try {
      const payload = {
        from,
        to,
        time,
        duration: Number(duration) || 120,
        daysOfWeek: Array.from(days),
      };
      const { created, skipped, conflicts } = await createSlotsBulk(payload);
      alert(`Fertig: neu ${created}, übersprungen ${skipped}, Konflikte (gebucht) ${conflicts}.`);
      onDone?.();
    } catch (e) {
      console.error(e);
      alert("Bulk-Hinzufügen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <div className="mb-2 font-medium">Serien-Termine hinzufügen</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs text-slate-600">Uhrzeit</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Dauer (Min.)</label>
          <input
            type="number"
            min="5"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-600">Von</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Bis</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setTo(lastDayOfActiveMonth)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            bis Monatsende
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs text-slate-600">Wochentage</div>
        <div className="flex flex-wrap gap-2">
          {DOW.map((d) => (
            <label key={d.id} className={
              "cursor-pointer rounded-lg border px-3 py-1 text-sm " +
              (days.has(d.id) ? "border-emerald-300 bg-emerald-50" : "border-slate-300")
            }>
              <input
                type="checkbox"
                className="mr-2 align-middle"
                checked={days.has(d.id)}
                onChange={() => toggleDay(d.id)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          disabled={busy}
          onClick={submit}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Serie hinzufügen
        </button>
      </div>
    </div>
  );
}
