import React from "react";
import { ymd } from "../lib/date";

export default function CalendarMonth({
  activeDate,
  onPrev,
  onNext,
  selectedDate,
  onSelectDate,
  todayStr,
  slots = [],
}) {
  const year = activeDate.getFullYear();
  const month = activeDate.getMonth(); // 0-11

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const title = activeDate.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  // Montag ist der erste Wochentag
  const startPad = (first.getDay() + 6) % 7; // Mo=0, So=6
  const daysInMonth = last.getDate();

  const days = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const weekdayShort = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function countsForDate(d) {
    const key = ymd(d);
    const items = slots.filter((s) => s.date === key);
    const total = items.length;
    const free = items.filter((s) => s.status === "free").length;
    return { total, free };
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            title="Vorheriger Monat"
          >
            ←
          </button>
          <button
            onClick={onNext}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            title="Nächster Monat"
          >
            →
          </button>
        </div>
      </div>

      {/* Weekdays */}
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {weekdayShort.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} className="h-24 rounded-xl border border-transparent" />;
          const key = ymd(d);
          const isToday = key === todayStr;
          const isSelected = key === selectedDate;
          const { total, free } = countsForDate(d);

          return (
            <button
              key={key}
              onClick={() => onSelectDate(d)}
              className={[
                "h-24 rounded-xl border p-2 text-left",
                isSelected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white",
                "hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{d.getDate()}</span>
                {isToday && (
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                    Heute
                  </span>
                )}
              </div>

              {total === 0 ? (
                <div className="mt-5 text-xs text-slate-400">Keine Slots</div>
              ) : (
                <div className="mt-4 text-[11px] leading-4 text-slate-700">
                  <div>Frei: <b>{free}</b></div>
                  <div className="text-slate-500">Gesamt: {total}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
