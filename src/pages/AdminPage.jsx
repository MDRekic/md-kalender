// src/pages/AdminPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AdminLogin from "../components/AdminLogin";
import AdminDashboard from "../components/AdminDashboard";
import CalendarMonth from "../components/CalendarMonth";
import AdminQuickAdd from "../components/AdminQuickAdd";
import AdminBulkAdd from "../components/AdminBulkAdd";
import AdminUserManager from "../components/AdminUserManager";

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
  // ✅ više ne koristimo “isAdmin” kao gate; želimo da i user uđe
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null); // "admin" | "user" | null

  const [activeDate, setActiveDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [slots, setSlots] = useState([]);

  const todayStr = useMemo(() => ymd(new Date()), []);

  // provjera sesije (na mount)
 useEffect(() => {
  authMe()
    .then((r) => {
      setIsLoggedIn(!!r.user || !!r.admin);      // prihvati i stari odgovor
      setUserRole(r.user?.role || (r.admin ? "admin" : null));
    })
    .catch(() => {
      setIsLoggedIn(false);
      setUserRole(null);
    });
}, []);

  // učitaj sve slotove čim je korisnik ulogovan (admin ili user)
  useEffect(() => {
    if (!isLoggedIn) return;
    listSlots()
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [isLoggedIn, selectedDate]);

  // slotovi za dan
  const daySlots = useMemo(
    () =>
      slots
        .filter((s) => s.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [slots, selectedDate]
  );

async function handleLogin(username, password) {
  try {
    await authLogin(username, password);      // postavi httpOnly cookie
    setIsLoggedIn(true);                      // odmah pusti u app

    // best-effort: pokušaj doznati rolu; ako zakaže, tretiraj kao "user"
    try {
      const r = await authMe();
      setUserRole(r.user?.role || (r.admin ? "admin" : "user"));
    } catch {
      setUserRole("user");
    }
  } catch (e) {
    console.error(e);
    alert("Falscher Benutzername oder Passwort.");
  }
}

  async function handleLogout() {
    await authLogout();
    setIsLoggedIn(false);
    setUserRole(null);
  }

  async function addSlot(timeStr, durationMin = 120) {
    if (!/^\d{2}:\d{2}$/.test(timeStr)) {
      return alert("Uhrzeit im Format HH:MM (z. B. 08:10).");
    }
    try {
      const created = await createSlot({
        date: selectedDate,
        time: timeStr,
        duration: Number(durationMin) || 120,
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

  // bulk/mjesečno dodavanje — poziva se iz AdminBulkAdd (vidi render ispod)
  async function bulkAdd({ dates, time, duration }) {
    const created = [];
    for (const d of dates) {
      try {
        const c = await createSlot({ date: d, time, duration });
        created.push(c);
      } catch (_) {
        // slot postoji ili greška – preskoči
      }
    }
    if (created.length) {
      setSlots((prev) =>
        [...prev, ...created].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
        })
      );
    }
    alert(`Fertig. Angelegt: ${created.length} Termin(e).`);
  }

  function clearDay() {
    if (!window.confirm("Alle freien Slots für diesen Tag löschen?")) return;
    // re-fetch (ako želiš pravo brisanje svih free slotova za dan, napravi BE rutu)
    listSlots().then(setSlots);
  }

  // ✅ login gate sada je “ulogovan”, ne “admin”
  if (!isLoggedIn) {
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
        <h1 className="text-2xl font-bold">
          {userRole === "admin" ? "Admin" : "Operater"}
        </h1>
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

          {/* pojedinačno dodavanje – vide i admin i user */}
          <AdminQuickAdd onAdd={(t, d) => addSlot(t, d)} />

          {/* ✅ mjesečno/mass dodavanje – vidi SAMO admin */}
          {userRole === "admin" && (
            <AdminBulkAdd selectedDate={selectedDate} onSubmit={bulkAdd} />
          )}

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
        {/* lista rezervacija, filtri, “Fertig”, brisanje s razlogom, CSV… */}
        <AdminDashboard onLogout={handleLogout} />
      </div>

      {userRole === "admin" && (
  <div className="mt-6">
    <AdminUserManager />
  </div>
)}
    </div>
  );
}
