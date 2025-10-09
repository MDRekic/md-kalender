// server/server.js  (ESM)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

import { all, get, migrate, run } from './db.js';
import { issueToken, verifyToken } from './auth.js';
import { makeTransport, bookingEmails } from './email.js';
import { sendMail } from './email.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);

// --- helpers ---
const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// migrate baze
await migrate();

// seed admin user ako ga nema
async function ensureAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const envHash = process.env.ADMIN_PASS_HASH || '';
  const row = await get('SELECT id FROM users WHERE username=?', [username]);
  if (!row) {
    const password_hash = envHash ? envHash : await bcrypt.hash('admin', 10);
    await run(
      'INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)',
      [username, password_hash, 'admin', process.env.ADMIN_EMAIL || null]
    );
    console.log(`[users] Seed admin created: ${username}`);
  }
}
ensureAdminUser().catch(console.error);

// security & parsers
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://termin.mydienst.de',
  credentials: true
}));

// rate limit
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }));

// --- auth middlewares ---
function readToken(req) {
  const token = req.cookies?.admtk;
  return token && verifyToken(token, process.env.JWT_SECRET || 'secret');
}
function ensureAdmin(req, res, next) {
  const decoded = readToken(req);
  if (!decoded?.admin) return res.status(401).json({ error: 'unauthorized' });
  req.user = decoded; // {uid, username, role, admin}
  next();
}
function ensureStaff(req, res, next) {
  const decoded = readToken(req);
  if (!decoded || !['admin', 'user'].includes(decoded.role)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = decoded;
  next();
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });

    const user = await get(
      'SELECT id, username, password_hash, role FROM users WHERE username=?',
      [username]
    );
    if (!user) return res.status(401).json({ error: 'bad_credentials' });

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'bad_credentials' });

    const payload = {
      uid: user.id,
      username: user.username,
      role: user.role,
      admin: user.role === 'admin'
    };
    const token = issueToken(payload, process.env.JWT_SECRET || 'secret');
    res.cookie('admtk', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 7 * 24 * 3600 * 1000
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'login_failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('admtk');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const decoded = readToken(req);
  res.json({ admin: !!decoded?.admin, user: decoded || null });
});

// ---------- USERS (ADMIN) ----------
app.get('/api/admin/users', ensureAdmin, async (_req, res) => {
  try {
    const rows = await all('SELECT id,username,role,email FROM users ORDER BY username');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'users_list_failed' }); }
});
app.post('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, role='user', email=null } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
    const exists = await get('SELECT id FROM users WHERE username=?', [username]);
    if (exists) return res.status(409).json({ error: 'user_exists' });
    const hash = await bcrypt.hash(password, 10);
    const { id } = await run('INSERT INTO users (username,password_hash,role,email) VALUES (?,?,?,?)',[username,hash,role,email]);
    const row = await get('SELECT id,username,role,email FROM users WHERE id=?',[id]);
    res.json(row);
  } catch (e) { console.error(e); res.status(500).json({ error: 'user_create_failed' }); }
});
app.patch('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const { password, role, email } = req.body || {};
    const id = req.params.id;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await run('UPDATE users SET password_hash=? WHERE id=?',[hash,id]);
    }
    if (role) await run('UPDATE users SET role=? WHERE id=?',[role,id]);
    if (typeof email !== 'undefined') await run('UPDATE users SET email=? WHERE id=?',[email,id]);
    const row = await get('SELECT id,username,role,email FROM users WHERE id=?',[id]);
    res.json(row);
  } catch (e) { console.error(e); res.status(500).json({ error: 'user_update_failed' }); }
});
app.delete('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const { changes } = await run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ deleted: changes });
  } catch (e) { res.status(500).json({ error: 'user_delete_failed' }); }
});

// ---------- SLOTS ----------
app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query;
    const rows = date
      ? await all('SELECT * FROM slots WHERE date=? ORDER BY time', [date])
      : await all('SELECT * FROM slots ORDER BY date,time');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'slots_list_failed' }); }
});

app.post('/api/slots', ensureAdmin, async (req, res) => {
  try {
    const { date, time, duration=120 } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: 'missing_fields' });
    const { id } = await run('INSERT INTO slots (date,time,duration,status) VALUES (?,?,?,?)',[date,time,duration,'free']);
    const row = await get('SELECT * FROM slots WHERE id=?',[id]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: 'slot_create_failed' }); }
});

app.delete('/api/slots/:id', ensureAdmin, async (req, res) => {
  try {
    const { changes } = await run('DELETE FROM slots WHERE id=? AND status!="booked"',[req.params.id]);
    res.json({ deleted: changes });
  } catch (e) { res.status(500).json({ error: 'slot_delete_failed' }); }
});

// ---------- BOOKINGS (public create) ----------
app.post('/api/bookings', async (req, res) => {
  try {
    const { slotId, fullName, email, phone, address, plz, city, note } = req.body || {};
    if (!slotId || !fullName || !email || !phone || !address || !plz || !city) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const slot = await get('SELECT * FROM slots WHERE id=?',[slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status === 'booked') return res.status(409).json({ error: 'already_booked' });

    const { id: bookingId } = await run(
      'INSERT INTO bookings (slot_id,full_name,email,phone,address,plz,city,note) VALUES (?,?,?,?,?,?,?,?)',
      [slotId, fullName, email, phone, address, plz, city, note || null]
    );
    await run('UPDATE slots SET status="booked" WHERE id=?',[slotId]);

    // e-mailovi
    setImmediate(async () => {
      try {
        const transport = makeTransport();
        const replyTo = process.env.REPLY_TO_EMAIL || 'termin@mydienst.de';
        const { subject, htmlInvitee, htmlAdmin } = bookingEmails({
          brand: process.env.BRAND_NAME || 'MyDienst',
          toAdmin: process.env.ADMIN_EMAIL,
          toInvitee: email,
          slot,
          booking: { full_name: fullName, email, phone, address, plz, city, note },
          replyTo
        });
        await transport.sendMail({ from: process.env.SMTP_USER, to: email, subject, html: htmlInvitee, replyTo });
        await transport.sendMail({ from: process.env.SMTP_USER, to: process.env.ADMIN_EMAIL, subject: `Neue Buchung – ${subject}`, html: htmlAdmin, replyTo });
      } catch (e) { console.error('[mail after booking] ', e); }
    });

    res.json({ bookingId, slotId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'booking_failed' }); }
});

// ---------- LISTS (staff) ----------
// helper: from/to
function parseRange(q) {
  const from = q.from || q.date_from || null;
  const to   = q.to   || q.date_to   || null;
  return { from, to };
}
// otvorene = sve rezervacije bez storna i bez “completed”
app.get('/api/admin/open', ensureStaff, async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const args = [];
    let where = '1=1';
    if (from) { where += ' AND s.date >= ?'; args.push(from); }
    if (to)   { where += ' AND s.date <= ?'; args.push(to); }
    const rows = await all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         LEFT JOIN completed_bookings cb ON cb.booking_id = b.id
         LEFT JOIN canceled_bookings  xb ON xb.booking_id = b.id
        WHERE ${where} AND cb.id IS NULL AND xb.id IS NULL
        ORDER BY s.date, s.time`, args
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'open_list_failed' }); }
});

app.get('/api/admin/completed', ensureStaff, async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const args = [];
    let where = '1=1';
    if (from) { where += ' AND c.slot_date >= ?'; args.push(from); }
    if (to)   { where += ' AND c.slot_date <= ?'; args.push(to); }
    const rows = await all(
      `SELECT c.id, c.booking_id, c.slot_date as date, c.slot_time as time, c.slot_duration as duration,
              c.full_name, c.email, c.phone, c.address, c.plz, c.city, c.note,
              c.completed_by, c.completed_by_id, c.created_at
         FROM completed_bookings c
        WHERE ${where}
        ORDER BY c.slot_date, c.slot_time`, args
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'completed_list_failed' }); }
});

app.get('/api/admin/canceled', ensureStaff, async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const args = [];
    let where = '1=1';
    if (from) { where += ' AND x.slot_date >= ?'; args.push(from); }
    if (to)   { where += ' AND x.slot_date <= ?'; args.push(to); }
    const rows = await all(
      `SELECT x.id, x.booking_id, x.slot_date as date, x.slot_time as time, x.slot_duration as duration,
              x.full_name, x.email, x.phone, x.address, x.plz, x.city, x.note,
              x.reason, x.canceled_by, x.canceled_by_id, x.created_at
         FROM canceled_bookings x
        WHERE ${where}
        ORDER BY x.slot_date, x.slot_time`, args
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'canceled_list_failed' }); }
});

// ---------- akcije na rezervacijama (staff) ----------
// “Fertig”: u completed_bookings
app.post('/api/admin/bookings/:id/complete', ensureStaff, async (req, res) => {
  try {
    const b = await get(
      `SELECT b.*, s.date, s.time, s.duration
         FROM bookings b JOIN slots s ON s.id=b.slot_id
        WHERE b.id=?`, [req.params.id]
    );
    if (!b) return res.status(404).json({ error: 'not_found' });

    await run(
      `INSERT INTO completed_bookings
        (booking_id, slot_date, slot_time, slot_duration,
         full_name, email, phone, address, plz, city, note,
         completed_by, completed_by_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.id,            // booking_id
        b.date,          // slot_date
        b.time,          // slot_time
        b.duration,      // slot_duration
        b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note || null,
        req.user.username, req.user.uid
      ]
    );

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'complete_failed' }); }
});

// “Löschen” sa razlogom: u canceled_bookings + oslobodi slot + izbriši booking
app.delete('/api/admin/bookings/:id', ensureStaff, async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason_required' });

    const b = await get(
      `SELECT b.*, s.id as slot_id, s.date, s.time, s.duration
         FROM bookings b JOIN slots s ON s.id=b.slot_id
        WHERE b.id=?`, [req.params.id]
    );
    if (!b) return res.status(404).json({ error: 'not_found' });

    // upiši u canceled_bookings  (⚠️ 14 kolona = 14 vrijednosti)
    await run(
      `INSERT INTO canceled_bookings
        (booking_id, slot_date, slot_time, slot_duration,
         full_name, email, phone, address, plz, city, note,
         reason, canceled_by, canceled_by_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.id,
        b.date, b.time, b.duration,
        b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note || null,
        reason, req.user.username, req.user.uid
      ]
    );

    // oslobodi slot i izbriši booking
    await run('UPDATE slots SET status="free" WHERE id=?', [b.slot_id]);
    await run('DELETE FROM bookings WHERE id=?', [b.id]);

    // e-mail obavijesti
    setImmediate(async () => {
      try {
        const subject = `Termin storniert – ${b.date} ${b.time}`;
        const html = `
          <p>Guten Tag ${escapeHtml(b.full_name)},</p>
          <p>Ihr Termin am <b>${b.date}</b> um <b>${b.time}</b> (Dauer ${b.duration} Min.) wurde storniert.</p>
          <p><b>Grund:</b> ${escapeHtml(reason)}</p>
          <p>— ${escapeHtml(process.env.BRAND_NAME || 'MyDienst')}</p>`;
        await sendMail({ to: b.email, subject, html });
        await sendMail({
          to: process.env.ADMIN_EMAIL,
          subject: `ADMIN: ${subject}`,
          html: `<p>Storniert von: ${escapeHtml(req.user.username)} (ID ${req.user.uid})</p>` + html
        });
      } catch (e) { console.error('[mail after cancel] ', e); }
    });

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'delete_failed' }); }
});

// ---------- CSV (admin only) ----------
app.get('/api/bookings.csv', ensureAdmin, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT b.id as booking_id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note, b.created_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ORDER BY s.date, s.time`
    );
    const header = ['booking_id','date','time','duration','full_name','email','phone','address','plz','city','note','created_at'];
    const csv = [header.join(',')]
      .concat(rows.map(r => header.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    res.send(csv);
  } catch (e) { res.status(500).send('csv_failed'); }
});

// ---------- PRINT ----------
app.get('/api/bookings/:id/print', async (req, res) => {
  try {
    const row = await get(
      `SELECT b.*, s.date, s.time, s.duration
         FROM bookings b JOIN slots s ON s.id=b.slot_id
        WHERE b.id=?`, [req.params.id]
    );
    if (!row) return res.status(404).send('Nicht gefunden');

    const brand = process.env.BRAND_NAME || 'MyDienst GmbH';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Terminbestätigung – ${brand}</title>
<style>body{font-family:Arial, sans-serif; margin:40px;}h1{margin:0 0 10px}.box{border:1px solid #ddd;padding:16px;border-radius:12px}.grid{display:grid;grid-template-columns:160px 1fr;gap:8px 16px}.muted{color:#666}button{padding:8px 14px;border-radius:8px;border:1px solid #ccc;background:#f8f8f8}</style></head><body>
<h1>${brand} – Terminbestätigung</h1><p class="muted">Buchungsnummer #${row.id}</p><div class="box"><div class="grid">
<div><b>Datum</b></div><div>${row.date}</div>
<div><b>Uhrzeit</b></div><div>${row.time}</div>
<div><b>Dauer</b></div><div>${row.duration} Min.</div>
<div><b>Name</b></div><div>${row.full_name}</div>
<div><b>E-Mail</b></div><div>${row.email}</div>
<div><b>Telefon</b></div><div>${row.phone}</div>
<div><b>Adresse</b></div><div>${row.address}</div>
<div><b>PLZ</b></div><div>${row.plz}</div>
<div><b>Stadt</b></div><div>${row.city}</div>
<div><b>Notiz</b></div><div>${row.note || '–'}</div>
<div><b>Erstellt am</b></div><div>${row.created_at}</div>
</div></div><p><button onclick="window.print()">Drucken</button></p></body></html>`);
  } catch (e) { console.error(e); res.status(500).send('print_failed'); }
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
