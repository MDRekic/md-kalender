import React, { useState } from "react";

export default function AdminQuickAdd({ onAdd }) {
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(120);

  const submit = (e) => {
    e.preventDefault();
    onAdd(time, Number(duration));
    setTime("");
  };

  return (
    <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-slate-600">Uhrzeit (HH:MM)</label>
        <input
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5"
          placeholder="z. B. 08:10"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600">Dauer (Min.)</label>
        <input
          type="number"
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          min={5}
          step={5}
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
      >
        Hinzufügen
      </button>
    </form>
  );
}
