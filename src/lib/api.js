// client/src/lib/api.js

const BASE = ""; // isti origin (nginx reverse proxy vodi na backend)

/** Generic fetch helper (JSON in/out, cookies on) */
async function jfetch(method, path, data) {
  const opts = {
    method,
    credentials: "include",
    headers: {}
  };
  if (data && method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(data);
  }
  const res = await fetch(`${BASE}${path}`, opts);

  let text = "";
  let json = null;
  try {
    text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch (_) {}

  if (!res.ok) {
    throw new Error(json?.error || text || `HTTP ${res.status}`);
  }
  return json;
}

/* ---------------- PUBLIC ---------------- */
export async function listSlots(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return jfetch("GET", `/api/slots${q}`);
}

export async function createBooking(payload) {
  return jfetch("POST", "/api/bookings", payload);
}

export function printUrl(bookingId) {
  return `/api/bookings/${bookingId}/print`;
}

/* ---------------- AUTH ---------------- */
export async function authMe() {
  return jfetch("GET", "/api/auth/me");
}
export async function authLogin(username, password) {
  return jfetch("POST", "/api/auth/login", { username, password });
}
export async function authLogout() {
  return jfetch("POST", "/api/auth/logout");
}

/* ------------- ADMIN: SLOTS ------------- */
export async function createSlot({ date, time, duration = 120 }) {
  return jfetch("POST", "/api/slots", { date, time, duration });
}
export async function deleteSlot(id) {
  return jfetch("DELETE", `/api/slots/${id}`);
}

/* ---------- ADMIN: BOOKINGS (liste) ---------- */
// Otvorene/aktivne rezervacije (sa opcionim periodom)
export async function adminListBookings({ from, to } = {}) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const qs = p.toString() ? `?${p.toString()}` : "";
  return jfetch("GET", `/api/admin/bookings${qs}`);
}

// Erledigte Aufträge (završeni)
export async function adminListCompleted({ from, to } = {}) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const qs = p.toString() ? `?${p.toString()}` : "";
  return jfetch("GET", `/api/admin/completed${qs}`);
}

// Storno Aufträge (otkazani)
export async function adminListCancellations({ from, to } = {}) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const qs = p.toString() ? `?${p.toString()}` : "";
  return jfetch("GET", `/api/admin/cancellations${qs}`);
}

/* ---------- ADMIN: BOOKINGS (akcije) ---------- */
// Storno (DELETE uz reason)
export async function adminDeleteBooking(id, reason) {
  return jfetch("DELETE", `/api/admin/bookings/${id}`, { reason });
}

// Označi kao završeno
export async function adminCompleteBooking(id) {
  return jfetch("POST", `/api/admin/bookings/${id}/complete`);
}
