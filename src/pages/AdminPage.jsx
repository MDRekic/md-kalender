import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLogin from "../components/AdminLogin";
import AdminDashboard from "../components/AdminDashboard";
import CalendarMonth from "../components/CalendarMonth";
import AdminQuickAdd from "../components/AdminQuickAdd";
import AdminBulkAdd from "../components/AdminBulkAdd"; // <= već si dodao
import { addMonths, ymd } from "../lib/date";
import {
  authMe, authLogin, authLogout,
  listSlots, createSlot, deleteSlot as apiDeleteSlot,
  adminListBookings, adminDeleteBooking
} from "../lib/api";

export default function AdminPage() {
  const [currentUser, setCurrentUser] = useState(null); // {role, username, ...}
  const isStaff = currentUser && (currentUser.role === 'admin' || currentUser.role === 'user');
  const isAdmin = currentUser && currentUser.role === 'admin';

  // ... tvoj ostali state ...

  useEffect(() => {
    authMe()
      .then((r) => setCurrentUser(r.ok ? { role: r.role, username: r.username } : null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    listSlots().then(setSlots).catch(() => setSlots([]));
  }, [isStaff, selectedDate]);

  async function handleLogin(u, p) {
    try {
      await authLogin(u, p);
      const r = await authMe();
      setCurrentUser(r.ok ? { role: r.role, username: r.username } : null);
    } catch {
      alert("Falscher Benutzername oder Passwort.");
    }
  }

  async function handleLogout() {
    await authLogout();
    setCurrentUser(null);
  }

  // ... sve ostalo ostaje kako je ...

  if (!isStaff) {
    // login ekran
    return (
      <div className="mx-auto max-w-6xl">
        {/* ... */}
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* ... header ... */}

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
          {/* quick add – dozvoljeno svima (staff) */}
          <AdminQuickAdd onAdd={(t, d) => addSlot(t, d)} />

          {/* BULK add – samo admin */}
          {isAdmin && (
            <AdminBulkAdd
              selectedDate={selectedDate}
              activeDate={activeDate}
              onDone={() => listSlots().then(setSlots)}
            />
          )}

          {/* ... ostatak desnog panela ... */}
        </section>
      </div>

      <div className="mt-6">
        <AdminDashboard onLogout={handleLogout} />
      </div>
    </div>
  );
}
