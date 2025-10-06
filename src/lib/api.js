// src/lib/api.js

// Ako je zadan REACT_APP_API i nije "localhost", koristi ga; inače radi relativno
const BASE =
  process.env.REACT_APP_API && !/localhost/i.test(process.env.REACT_APP_API)
    ? process.env.REACT_APP_API.replace(/\/+$/, '') // skini završne /
    : ''; // relativno (isti host)

async function jfetch(url, opts = {}) {
  // osiguraj da path uvijek počinje s /
  const path = url.startsWith('/') ? url : `/${url}`;

  const r = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return /json/.test(r.headers.get('content-type') || '')
    ? r.json()
    : r.text();
}

// Public
export const listSlots           = (date) => jfetch(`/api/slots${date ? `?date=${encodeURIComponent(date)}` : ''}`);
export const createBooking       = (payload) => jfetch('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
export const printUrl            = (id) => `${BASE}/api/bookings/${id}/print`;

// Auth
export const authMe              = () => jfetch('/api/auth/me');
export const authLogin           = (u, p) => jfetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
export const authLogout          = () => jfetch('/api/auth/logout', { method: 'POST' });

// Admin
export const createSlot          = (s)  => jfetch('/api/slots', { method: 'POST', body: JSON.stringify(s) });
export const deleteSlot          = (id) => jfetch(`/api/slots/${id}`, { method: 'DELETE' });
export const listBookingsAdmin   = ()  => jfetch('/api/admin/bookings');
export const deleteBookingAdmin  = (id) => jfetch(`/api/admin/bookings/${id}`, { method: 'DELETE' });
export const csvUrl              = ()  => `${BASE}/api/bookings.csv`;
