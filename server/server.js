// server/server.js  (ESM)

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, migrate } from './db.js';
import { sendMail } from './email.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------
// Setup
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
    }
  }
}));

app.use(express.json());
app.use(cookieParser());

const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: ORIGIN,
  credentials: true,
}));

const PORT = Number(process.env.PORT || 5174);

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
const TOKEN_COOKIE = 'mdk_token';

function issueToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
}

function readToken(req) {
  const t = req.cookies?.[TOKEN_COOKIE];
  if (!t) return null;
  try {
    return jwt.verify(t, process.env.JWT_SECRET || 'dev_secret');
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const tok = readToken(req);
  if (!tok || !tok.admin) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// ----------------------------------------------------
// Auth
// ----------------------------------------------------
app.get('/api/auth/me', (req, res) => {
  const tok = readToken(req);
  res.json({ admin: !!tok?.admin });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const okUser = username === (process.env.ADMIN_USER || 'admin');
  const okPass = await bcrypt.compare(password || '', process.env.ADMIN_PASS_HASH || '');
  if (!okUser || !okPass) return res.status(401).json({ error: 'bad_credentials' });

  const token = issueToken({ admin: true });
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ORIGIN.startsWith('https'),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// ----------------------------------------------------
// Slots (public + admin)
// ----------------------------------------------------

// GET /api/slots?date=YYYY-MM-DD (ako date nije dan, vraća sve slotove u mjesecu)
app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query || {};
    let rows;
    if (date) {
      rows = await db.all(
        `SELECT * FROM slots WHERE date = ? ORDER BY time`, [date]
      );
    } else {
      rows = await db.all(`SELECT * FROM slots ORDER BY date, time`);
    }
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/slots  {date, time, duration}
app.post('/api/slots', requireAdmin, async (req, res) => {
  try {
    const { date, time, duration = 120 } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: 'missing_fields' });

    const r = await db.run(
      `INSERT INTO slots (date,time,duration,status) VALUES (?,?,?,'free')`,
      [date, time, Number(duration)]
    );
    const created = await db.get(`SELECT * FROM slots WHERE id = ?`, [r.lastID]);
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /api/slots/:id   (samo ako nije rezerviran)
app.delete('/api/slots/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const slot = await db.get(`SELECT * FROM slots WHERE id = ?`, [id]);
    if (!slot) return res.status(404).json({ error: 'not_found' });
    if (slot.status !== 'free') return res.status(400).json({ error: 'reserved' });

    await db.run(`DELETE FROM slots WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// ----------------------------------------------------
// Bookings (public create)
// ----------------------------------------------------

// POST /api/bookings  {slotId, fullName, email, phone, address, plz, city, note}
app.post('/api/bookings', async (req, res) => {
  try {
    const { slotId, fullName, email, phone, address, plz, city, note } = req.body || {};
    if (!slotId || !fullName || !email || !phone || !address || !plz || !city)
      return res.status(400).json({ error: 'missing_fields' });

    const slot = await db.get(`SELECT * FROM slots WHERE id = ?`, [slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status !== 'free') return res.status(400).json({ error: 'slot_taken' });

    const ins = await db.run(
      `INSERT INTO bookings (slot_id, full_name, email, phone, address, plz, city, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`,
      [slotId, fullName, email, phone, address, plz, city, note || null]
    );
    await db.run(`UPDATE slots SET status = 'booked' WHERE id = ?`, [slotId]);

    // e-mail potvrde
    const when = `${slot.date} ${slot.time}`;
    const subject = `Termin bestätigt – ${when}`;
    const htmlUser = `
      <p>Guten Tag ${escapeHtml(fullName)},</p>
      <p>Ihr Termin am <b>${slot.date}</b> um <b>${slot.time}</b> (Dauer ${slot.duration} Min.) ist bestätigt.</p>
      <p><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</p>
      ${note ? `<p><b>Notiz:</b> ${escapeHtml(note)}</p>` : ''}
      <p>— ${escapeHtml(process.env.BRAND_NAME || 'MyDienst')}</p>
    `;
    const htmlAdmin = `
      <p>Neue Buchung:</p>
      <ul>
        <li><b>Datum/Zeit:</b> ${slot.date} ${slot.time}</li>
        <li><b>Dauer:</b> ${slot.duration} Min.</li>
        <li><b>Kunde:</b> ${escapeHtml(fullName)} (${escapeHtml(email)})</li>
        <li><b>Telefon:</b> ${escapeHtml(phone)}</li>
        <li><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</li>
        ${note ? `<li><b>Notiz:</b> ${escapeHtml(note)}</li>` : ''}
      </ul>
    `;
    // Pošalji kupcu i adminu (pokušaj, ali nemoj rušiti ako mail padne)
    try { await sendMail({ to: email, subject, html: htmlUser }); } catch (e) { console.error('mail user', e); }
    try { await sendMail({ to: process.env.ADMIN_EMAIL, subject: `ADMIN: ${subject}`, html: htmlAdmin }); } catch (e) { console.error('mail admin', e); }

    res.json({ ok: true, bookingId: ins.lastID });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/bookings.csv (admin export)
app.get('/api/bookings.csv', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note, b.created_at
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       ORDER BY s.date DESC, s.time DESC`
    );
    const header = [
      'id', 'date', 'time', 'duration',
      'full_name', 'email', 'phone', 'address', 'plz', 'city', 'note', 'created_at'
    ];
    const csv = [header.join(',')]
      .concat(rows.map(r => header.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/bookings/:id/print  – jednostavan HTML za print
app.get('/api/bookings/:id/print', async (req, res) => {
  try {
    const id = req.params.id;
    const r = await db.get(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note, b.created_at
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.id = ?`,
      [id]
    );
    if (!r) return res.status(404).send('Not found');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <html><head><meta charset="utf-8"><title>Buchung #${r.id}</title>
        <style>body{font-family:system-ui,Arial,sans-serif;padding:24px} h1{margin-top:0}</style>
      </head><body>
        <h1>Termin-Bestätigung #${r.id}</h1>
        <p><b>Datum/Zeit:</b> ${r.date} ${r.time} (${r.duration} Min.)</p>
        <p><b>Kunde:</b> ${escapeHtml(r.full_name)} (${escapeHtml(r.email)})</p>
        <p><b>Telefon:</b> ${escapeHtml(r.phone||'')}</p>
        <p><b>Adresse:</b> ${escapeHtml(r.address||'')}, ${escapeHtml(r.plz||'')} ${escapeHtml(r.city||'')}</p>
        ${r.note ? `<p><b>Notiz:</b> ${escapeHtml(r.note)}</p>` : ''}
        <p style="margin-top:32px">— ${escapeHtml(process.env.BRAND_NAME || 'MyDienst')}</p>
        <script>window.print()</script>
      </body></html>
    `);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

// ----------------------------------------------------
// Admin – list & delete booking (sa razlogom + email)
// ----------------------------------------------------
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note, b.created_at
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       ORDER BY s.date DESC, s.time DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /api/admin/bookings/:id  {reason}
app.delete('/api/admin/bookings/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'reason_required' });
  }

  try {
    const booking = await db.get(
      `SELECT b.id, b.full_name as fullName, b.email, b.phone, b.address, b.plz, b.city,
              s.date, s.time, s.duration, s.id as slotId
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.id = ?`,
      [id]
    );
    if (!booking) return res.status(404).json({ error: 'not_found' });

    await db.run(`DELETE FROM bookings WHERE id = ?`, [id]);
    await db.run(`UPDATE slots SET status = 'free' WHERE id = ?`, [booking.slotId]);

    const when = `${booking.date} ${booking.time}`;
    const subject = `Termin storniert – ${when}`;
    const htmlUser = `
      <p>Guten Tag ${escapeHtml(booking.fullName)},</p>
      <p>Ihr Termin am <b>${booking.date}</b> um <b>${booking.time}</b> (Dauer ${booking.duration} Min.) wurde storniert.</p>
      <p><b>Grund:</b> ${escapeHtml(reason)}</p>
      <p>— ${escapeHtml(process.env.BRAND_NAME || 'MyDienst')}</p>
    `;
    const htmlAdmin = `
      <p>Termin storniert:</p>
      <ul>
        <li><b>Kunde:</b> ${escapeHtml(booking.fullName)} (${escapeHtml(booking.email)})</li>
        <li><b>Telefon:</b> ${escapeHtml(booking.phone || '')}</li>
        <li><b>Adresse:</b> ${escapeHtml(booking.address || '')}, ${escapeHtml(booking.plz || '')} ${escapeHtml(booking.city || '')}</li>
        <li><b>Datum/Zeit:</b> ${booking.date} ${booking.time}</li>
        <li><b>Dauer:</b> ${booking.duration} Min.</li>
      </ul>
      <p><b>Grund:</b> ${escapeHtml(reason)}</p>
    `;
    try { await sendMail({ to: booking.email, subject, html: htmlUser }); } catch (e) { console.error('mail user', e); }
    try { await sendMail({ to: process.env.ADMIN_EMAIL, subject: `ADMIN: ${subject}`, html: htmlAdmin }); } catch (e) { console.error('mail admin', e); }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

// ----------------------------------------------------
// Start
// ----------------------------------------------------
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}).catch((e) => {
  console.error('Migration failed', e);
  process.exit(1);
});
