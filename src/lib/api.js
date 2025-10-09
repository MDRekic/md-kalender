const BASE = "";

async function jfetch(method, path, data) {
  const opts = { method, credentials: "include", headers: {} };
  if (data && method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(data);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let text = "", json = null;
  try { text = await res.text(); json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
  return json;
}

/* PUBLIC */
export async function listSlots(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return jfetch("GET", `/api/slots${q}`);
}
export async function createBooking(payload) {
  return jfetch("POST", "/api/bookings", payload);
}
export const printUrl = (id) => `/api/bookings/${id}/print`;

/* AUTH */
export async function authMe() { return jfetch("GET", "/api/auth/me"); }
export async function authLogin(username, password) {
  return jfetch("POST", "/api/auth/login", { username, password });
}
export async function authLogout() { return jfetch("POST", "/api/auth/logout"); }

/* SLOTS (admin) */
export async function createSlot({ date, time, duration=120 }) { return jfetch("POST","/api/slots",{date,time,duration}); }
export async function deleteSlot(id) { return jfetch("DELETE", `/api/slots/${id}`); }

/* BOOKINGS – LISTE (staff) */
export async function adminListOpen({from,to}={}) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  const qs = p.toString() ? `?${p.toString()}` : '';
  return jfetch("GET", `/api/admin/open${qs}`);
}
export async function adminListCompleted({from,to}={}) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  const qs = p.toString() ? `?${p.toString()}` : '';
  return jfetch("GET", `/api/admin/completed${qs}`);
}
export async function adminListCanceled({from,to}={}) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  const qs = p.toString() ? `?${p.toString()}` : '';
  return jfetch("GET", `/api/admin/canceled${qs}`);
}

/* BOOKINGS – AKCIJE (staff) */
export async function adminCompleteBooking(id) {
  return jfetch("POST", `/api/admin/bookings/${id}/complete`);
}
export async function adminDeleteBooking(id, reason) {
  return jfetch("DELETE", `/api/admin/bookings/${id}`, { reason });
}
