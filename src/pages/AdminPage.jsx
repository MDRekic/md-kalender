// src/pages/AdminPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AdminLogin from "../components/AdminLogin";
import AdminDashboard from "../components/AdminDashboard";
import CalendarMonth from "../components/CalendarMonth";
import AdminQuickAdd from "../components/AdminQuickAdd";

import { addMonths, ymd } from "../lib/date";
import {
  authMe,
  authLogin,
  authLogout,
  listSlots,
  createSlot,
  deleteSlot as apiDeleteSlot,
} from "../lib/api";

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  const [activeDate, setActiveDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [slots, setSlots] = useState([]);

  const todayStr = useMemo(() => ymd(new Date()), []);

  // provjera sesije
  useEffect(() => {
    authMe()
      .then((r) => setIsAdmin(!!r.admin))
      .catch(() => setIsAdmin(false));
  }, []);

  // učitaj slotove (može sve pa filtriramo po selectedDate)
  useEffect(() => {
    if (!isAdmin) return;
    listSlots()
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [isAdmin, selectedDate]);

  // slotovi samo za označeni dan
  const daySlots = useMemo(
    () =>
      slots
        .filter((s) => s.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [slots, selectedDate]
  );

  async function handleLogin(username, password) {
    try {
      await authLogin(username, password);
      setIsAdmin(true);
    } catch {
      alert("Falscher Benutzername oder Passwort.");
    }
  }

  async function handleLogout() {
    await authLogout();
    setIsAdmin(false);
  }

  async function addSlot(timeStr, durationMin = 120) {
    if (!/^\d{2}:\d{2}$/.test(timeStr))
      return alert("Uhrzeit im Format HH:MM (z. B. 08:10).");
    try {
      const created = await createSlot({
        date: selectedDate,
        time: timeStr,
        duration: durationMin,
      });
      setSlots((prev) =>
        [...prev, created].sort((a, b) => a.time.localeCompare(b.time))
      );
    } catch {
      alert("Hinzufügen fehlgeschlagen.");
    }
  }

  async function deleteSlot(id) {
    try {
      await apiDeleteSlot(id);
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Löschen fehlgeschlagen (reserviert).");
    }
  }

  function clearDay() {
    // za sada samo refresh (ako želiš brisanje svih free slotova, to je poseban endpoint)
    listSlots().then(setSlots);
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin</h1>
          <Link
            to="/kalendar"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            ← Zurück zum Kalender
          </Link>
        </div>
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          <Link
            to="/kalendar"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            ← Zurück zum Kalender
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Abmelden
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <CalendarMonth
            activeDate={activeDate}
            onPrev={() => setActiveDate((d) => addMonths(d, -1))}
            onNext={() => setActiveDate((d) => addMonths(d, 1))}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(ymd(d))}
            todayStr={todayStr}
            slots={slots}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Termine – {selectedDate}</h2>
            <button
              onClick={clearDay}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
            >
              Tag leeren
            </button>
          </div>

          <AdminQuickAdd onAdd={(t, d) => addSlot(t, d)} />

          {daySlots.length === 0 ? (
            <p className="mt-2 text-slate-500">Keine Termine an diesem Tag.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {daySlots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                >
                  <div>
                    <div className="font-medium">
                      {s.time} · {s.duration} Min.
                    </div>
                    <div className="text-sm">
                      Status:{" "}
                      {s.status === "free" ? (
                        <span className="text-emerald-600">frei</span>
                      ) : (
                        <span className="text-amber-600">reserviert</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === "free" && (
                      <button
                        onClick={() => deleteSlot(s.id)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6">
        <AdminDashboard onLogout={handleLogout} />
      </div>
    </div>
  );
}
