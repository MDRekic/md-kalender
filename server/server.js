// server/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import { all, get, migrate, run } from './db.js';
import { makeTransport, bookingEmails } from './email.js';
import { issueToken, verifyToken, verifyAdminCredentials } from './auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);

// DB migracije (kreira tabele ako ne postoje)
migrate();

// security & parsers
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());

// CORS (u produkciji postavi CORS_ORIGIN na tvoj domen)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// rate limit
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/api/auth', authLimiter);
app.use('/api/bookings', rateLimit({ windowMs: 60_000, max: 100 }));

// --- helper middleware ---
function ensureAdmin(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.admin) return res.status(401).json({ error: 'unauthorized' });
  req.admin = decoded;
  next();
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const ok = await verifyAdminCredentials(username, password, process.env);
  if (!ok) return res.status(401).json({ error: 'bad_credentials' });

  const token = issueToken({ admin: true, username }, process.env.JWT_SECRET || 'secret');
  res.cookie('admtk', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // stavi true kad imaš HTTPS
    maxAge: 7 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('admtk');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  res.json({ admin: !!decoded?.admin });
});

// ---------- SLOTS ----------
app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query;
    const rows = date
      ? await all('SELECT * FROM slots WHERE date=? ORDER BY time', [date])
      : await all('SELECT * FROM slots ORDER BY date,time');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'slots_list_failed' });
  }
});

app.post('/api/slots', ensureAdmin, async (req, res) => {
  try {
    const { date, time, duration = 120 } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: 'missing_fields' });

    const { id } = await run(
      'INSERT INTO slots (date,time,duration,status) VALUES (?,?,?,?)',
      [date, time, duration, 'free']
    );
    const row = await get('SELECT * FROM slots WHERE id=?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'slot_create_failed' });
  }
});

app.delete('/api/slots/:id', ensureAdmin, async (req, res) => {
  try {
    // brisanje samo ako slot nije rezervisan
    const { changes } = await run(
      'DELETE FROM slots WHERE id=? AND status!="booked"',
      [req.params.id]
    );
    res.json({ deleted: changes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'slot_delete_failed' });
  }
});

// ---------- BOOKINGS (public POST) ----------
app.post('/api/bookings', async (req, res) => {
  try {
    const { slotId, fullName, email, phone, address, note } = req.body || {};
    // Telefon i Adresa su obavezni
    if (!slotId || !fullName || !email || !phone || !address) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const slot = await get('SELECT * FROM slots WHERE id=?', [slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status === 'booked') return res.status(409).json({ error: 'already_booked' });

    const { id: bookingId } = await run(
      'INSERT INTO bookings (slot_id, full_name, email, phone, address, note) VALUES (?,?,?,?,?,?)',
      [slotId, fullName, email, phone, address, note || null]
    );
    await run('UPDATE slots SET status="booked" WHERE id=?', [slotId]);

    // ✉️ email-notifikacije (DE) + Reply-To
    const transport = makeTransport();
    const replyTo = process.env.REPLY_TO_EMAIL || 'termin@mydienst.de';

    const { subject, htmlInvitee, htmlAdmin } = bookingEmails({
      brand: process.env.BRAND_NAME || 'MyDienst',
      toAdmin: process.env.ADMIN_EMAIL,
      toInvitee: email,
      slot,
      booking: { full_name: fullName, email, phone, address, note },
      replyTo, // šaljemo u template zbog linka u footeru
    });

    // klijent
    transport
      .sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject,
        html: htmlInvitee,
        replyTo, // odgovori idu na termin@mydienst.de
      })
      .catch(console.error);

    // admin
    transport
      .sendMail({
        from: process.env.SMTP_USER,
        to: process.env.ADMIN_EMAIL,
        subject: `Neue Buchung – ${subject}`,
        html: htmlAdmin,
        replyTo,
      })
      .catch(console.error);

    res.json({ bookingId, slotId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'booking_failed' });
  }
});

// ---------- ADMIN BOOKINGS LIST ----------
app.get('/api/admin/bookings', ensureAdmin, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT b.id, s.date, s.time, s.duration, b.full_name, b.email, b.phone, b.address, b.note, b.created_at
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       ORDER BY s.date, s.time`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'bookings_list_failed' });
  }
});

app.delete('/api/admin/bookings/:id', ensureAdmin, async (req, res) => {
  try {
    await run('DELETE FROM bookings WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'booking_delete_failed' });
  }
});

// ---------- CSV (admin only) ----------
app.get('/api/bookings.csv', ensureAdmin, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT b.id as booking_id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.note, b.created_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ORDER BY s.date, s.time`
    );
    const header = ['booking_id','date','time','duration','full_name','email','phone','address','note','created_at'];
    const csv = [header.join(',')]
      .concat(rows.map(r => header.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).send('csv_failed');
  }
});

// ---------- PRINT (DE) ----------
app.get('/api/bookings/:id/print', async (req, res) => {
  try {
    const row = await get(
      `SELECT b.*, s.date, s.time, s.duration
         FROM bookings b JOIN slots s ON s.id=b.slot_id
        WHERE b.id=?`,
      [req.params.id]
    );
    if (!row) return res.status(404).send('Nicht gefunden');

    const brand = process.env.BRAND_NAME || 'MyDienst GmbH';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8">
<title>Terminbestätigung – ${brand}</title>
<style>
  body{font-family:Arial, sans-serif; margin:40px;}
  h1{margin:0 0 10px}
  .box{border:1px solid #ddd; padding:16px; border-radius:12px}
  .grid{display:grid; grid-template-columns:160px 1fr; gap:8px 16px}
  .muted{color:#666}
  button{padding:8px 14px; border-radius:8px; border:1px solid #ccc; background:#f8f8f8}
</style></head><body>
  <h1>${brand} – Terminbestätigung</h1>
  <p class="muted">Buchungsnummer #${row.id}</p>
  <div class="box">
    <div class="grid">
      <div><b>Datum</b></div><div>${row.date}</div>
      <div><b>Uhrzeit</b></div><div>${row.time}</div>
      <div><b>Dauer</b></div><div>${row.duration} Min.</div>
      <div><b>Name</b></div><div>${row.full_name}</div>
      <div><b>E-Mail</b></div><div>${row.email}</div>
      <div><b>Telefon</b></div><div>${row.phone}</div>
      <div><b>Adresse</b></div><div>${row.address}</div>
      <div><b>Notiz</b></div><div>${row.note || '–'}</div>
      <div><b>Erstellt am</b></div><div>${row.created_at}</div>
    </div>
  </div>
  <p><button onclick="window.print()">Drucken</button></p>
</body></html>`);
  } catch (e) {
    console.error(e);
    res.status(500).send('print_failed');
  }
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
