// server/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

import { all, get, migrate, run } from './db.js';
import { makeTransport, bookingEmails, sendMail } from './email.js';
import { issueToken, verifyToken } from './auth.js';
//import { bookingEmails, sendMail } from './email.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);

// helpers
const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// migrate
migrate();

// seed admin
async function ensureAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const envHash = process.env.ADMIN_PASS_HASH || '';
  const row = await get('SELECT id FROM users WHERE username=?', [username]);
  if (!row) {
    const password_hash = envHash && envHash.length > 0 ? envHash : await bcrypt.hash('admin', 10);
    await run(
      'INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)',
      [username, password_hash, 'admin', process.env.ADMIN_EMAIL || null]
    );
    console.log(`[users] Seed admin created: ${username}${envHash ? ' (from .env hash)' : ' (default pass: "admin")'}`);
  }
}
ensureAdminUser().catch(console.error);

// middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// rate limit
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }));
app.use('/api/bookings', rateLimit({ windowMs: 60_000, max: 100 }));

// guards
function ensureAdmin(req, res, next) {
    function ensureStaff(req, res, next) {
  return ensurePrivileged(req, res, next);
}
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.role || decoded.role !== 'admin') return res.status(401).json({ error: 'unauthorized' });
  req.user = decoded;
  next();
}
function ensurePrivileged(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.role || !['admin', 'user'].includes(decoded.role)) return res.status(401).json({ error: 'unauthorized' });
  req.user = decoded;
  next();
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
    const user = await get('SELECT id, username, password_hash, role, email FROM users WHERE username=?', [username]);
    if (!user) return res.status(401).json({ error: 'bad_credentials' });
    const okPass = await bcrypt.compare(password, user.password_hash || '');
    if (!okPass) return res.status(401).json({ error: 'bad_credentials' });
    const token = issueToken(
      { admin: user.role === 'admin', username: user.username, uid: user.id, role: user.role, email: user.email || null },
      process.env.JWT_SECRET || 'secret'
    );
    res.cookie('admtk', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!process.env.CORS_ORIGIN?.startsWith('https'),
      maxAge: 7 * 24 * 3600 * 1000,
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
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  res.json({ admin: decoded?.role === 'admin', user: decoded || null });
});

// ---------- USER MGMT (admin only) ----------
app.post('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, role = 'user', email = null } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
    const exists = await get('SELECT id FROM users WHERE username=?', [username]);
    if (exists) return res.status(409).json({ error: 'user_exists' });
    const password_hash = await bcrypt.hash(password, 10);
    const { id } = await run('INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)', [
      username,
      password_hash,
      role,
      email,
    ]);
    const row = await get('SELECT id, username, role, email FROM users WHERE id=?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'user_create_failed' });
  }
});
app.patch('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const { password, role, email } = req.body || {};
    const id = req.params.id;
    if (password) {
      const password_hash = await bcrypt.hash(password, 10);
      await run('UPDATE users SET password_hash=? WHERE id=?', [password_hash, id]);
    }
    if (role) await run('UPDATE users SET role=? WHERE id=?', [role, id]);
    if (typeof email !== 'undefined') await run('UPDATE users SET email=? WHERE id=?', [email, id]);
    const row = await get('SELECT id, username, role, email FROM users WHERE id=?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'user_update_failed' });
  }
});
app.get('/api/admin/users', ensureAdmin, async (_req, res) => {
  try {
    const rows = await all('SELECT id, username, role, email FROM users ORDER BY username');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'users_list_failed' });
  }
});
app.delete('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const { changes } = await run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ deleted: changes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'user_delete_failed' });
  }
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

// PRIVILEGIRANI (admin i operater) – dodaj JEDAN slot
// (operater smije dodati pojedinačni slot; bulk dodavanje je sakriveno u UI)
app.post('/api/slots', ensurePrivileged, async (req, res) => {
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

// (po želji) brisanje slobodnog slota – ovo ostavite za admina
app.delete('/api/slots/:id', ensureAdmin, async (req, res) => {
  try {
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
    const {
      slotId, fullName, email, phone, address, plz, city, note,
      units,                       // <— dolazi s fronta
    } = req.body || {};

    if (!slotId || !fullName || !email || !phone || !address || !plz || !city) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    // normaliziraj units (dozvoli prazno -> NULL, inače cijeli broj >= 0)
    const einheiten =
      typeof units === 'number' || /^\d+$/.test(String(units || ''))
        ? Math.max(0, parseInt(units, 10))
        : null;

    const slot = await get('SELECT * FROM slots WHERE id=?', [slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status === 'booked') return res.status(409).json({ error: 'already_booked' });

    // ⬇⬇⬇ dodan stupac einheiten
    const { id: bookingId } = await run(
      'INSERT INTO bookings (slot_id, full_name, email, phone, address, plz, city, note, einheiten) VALUES (?,?,?,?,?,?,?,?,?)',
      [slotId, fullName, email, phone, address, plz, city, note || null, einheiten]
    );
    await run('UPDATE slots SET status="booked" WHERE id=?', [slotId]);

    // ... (ostatak mailova ostaje identičan)
setImmediate(async () => {
  try {
    const replyTo = process.env.REPLY_TO_EMAIL || 'termin@mydienst.de';

    const { subject, htmlInvitee, htmlAdmin } = bookingEmails({
      brand: process.env.BRAND_NAME || 'MyDienst',
      toAdmin: process.env.ADMIN_EMAIL,
      toInvitee: email,
      slot, // objekt slota koji si već učitao
      booking: {
        full_name: fullName,
        email,
        phone,
        address,
        plz,
        city,
        note,
        einheiten: req.body?.einheiten ?? null, // ako šalješ broj jedinica
      },
      replyTo,
    });

    // kupac
    await sendMail({
      to: email,
      subject,
      html: htmlInvitee,
      replyTo,
    });

    // admin
    await sendMail({
      to: process.env.ADMIN_EMAIL,
      subject: `Neue Buchung – ${subject}`,
      html: htmlAdmin,
      replyTo,
    });

    console.log('[mail after booking] OK');
  } catch (err) {
    console.error('[mail after booking] FAILED:', err);
  }
});

    res.json({ bookingId, slotId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'booking_failed' });
  }
});

// util
function rangeWhere(from, to, col = 's.date') {
  const out = { sql: '', params: [] };
  if (from && to) {
    out.sql = `WHERE ${col} BETWEEN ? AND ?`;
    out.params = [from, to];
  } else if (from) {
    out.sql = `WHERE ${col} >= ?`;
    out.params = [from];
  } else if (to) {
    out.sql = `WHERE ${col} <= ?`;
    out.params = [to];
  }
  return out;
}

// ---------- LISTE (open) ----------
app.get('/api/admin/bookings', ensurePrivileged, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const params = [];
    let where = ' WHERE b.completed_at IS NULL ';   // << KLJUČNO: isključi završene
    if (from) { where += ' AND s.date >= ?'; params.push(from); }
    if (to)   { where += ' AND s.date <= ?'; params.push(to); }

    const rows = await all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note,
              b.einheiten AS einheiten,
              b.created_at, b.completed_by, b.completed_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
        ${where}
        ORDER BY s.date, s.time`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'bookings_list_failed' });
  }
});


// ---------- LISTE (completed) ----------
app.get('/api/admin/completed', ensurePrivileged, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const r = rangeWhere(from, to);
    const rows = await all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note,
              b.einheiten AS einheiten,                      -- << DODANO
              b.completed_by, b.completed_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ${r.sql ? r.sql + ' AND ' : 'WHERE '} s.status='booked' AND b.completed_at IS NOT NULL
       ORDER BY s.date, s.time`,
      r.params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'completed_list_failed' });
  }
});


// ---------- COMPLETE (Fertig) ----------
app.post('/api/admin/bookings/:id/complete', ensurePrivileged, async (req, res) => {
  const id = req.params.id;
  const completedBy = req.user?.username || 'system';
  try {
    await run('UPDATE bookings SET completed_at=datetime("now"), completed_by=? WHERE id=?', [completedBy, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'complete_failed' });
  }
});

// ---------- DELETE (Storno + audit + mail) ----------
app.delete('/api/admin/bookings/:id', ensureStaff, async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'reason_required' });
  }

  try {
    const row = await get(
      `SELECT b.*, s.date AS slot_date, s.time AS slot_time, s.duration AS slot_duration, s.id AS slot_id
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
        WHERE b.id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'not_found' });

    await run(
      `INSERT INTO canceled_bookings
         (booking_id, slot_date, slot_time, slot_duration,
          full_name, email, phone, address, plz, city, note,
          reason, canceled_by, canceled_by_id, einheiten, canceled_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        row.id,
        row.slot_date, row.slot_time, row.slot_duration,
        row.full_name, row.email, row.phone, row.address, row.plz, row.city, row.note || null,
        reason.trim(), req.user?.username || 'system', req.user?.uid || null,
        row.einheiten ?? null
      ]
    );

    await run(`DELETE FROM bookings WHERE id=?`, [id]);
    await run(`UPDATE slots SET status='free' WHERE id=?`, [row.slot_id]);

    // ... (mailovi ostaju identični)
    const when = `${row.slot_date} ${row.slot_time}`;
    const subject = `Termin storniert – ${when}`;
    const html = `
      <p>Guten Tag ${escapeHtml(row.full_name)},</p>
      <p>Ihr Termin am <b>${row.slot_date}</b> um <b>${row.slot_time}</b> (Dauer ${row.slot_duration} Min.) wurde storniert.</p>
      <p><b>Grund:</b> ${escapeHtml(reason)}</p>
      <p>— ${process.env.BRAND_NAME || 'MyDienst'}</p>`;
    await sendMail({ to: row.email, subject, html });
    await sendMail({
      to: process.env.ADMIN_EMAIL,
      subject: `ADMIN: ${subject}`,
      html: `<p>Storno erfasst.</p>
             <ul>
               <li><b>Kunde:</b> ${escapeHtml(row.full_name)} (${escapeHtml(row.email)})</li>
               <li><b>Telefon:</b> ${escapeHtml(row.phone || '')}</li>
               <li><b>Adresse:</b> ${escapeHtml(row.address || '')}, ${escapeHtml(row.plz || '')} ${escapeHtml(row.city || '')}</li>
               <li><b>Einheiten:</b> ${row.einheiten ?? '—'}</li>
               <li><b>Datum/Zeit:</b> ${row.slot_date} ${row.slot_time} · ${row.slot_duration} Min.</li>
               <li><b>Grund:</b> ${escapeHtml(reason)}</li>
               <li><b>Storniert von:</b> ${escapeHtml(req.user?.username || '')}</li>
             </ul>`
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});


// ---------- LISTE (cancellations) ----------
app.get('/api/admin/cancellations', ensurePrivileged, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const r = rangeWhere(from, to, 'x.slot_date');
    const rows = await all(
      `SELECT x.id, x.booking_id,
              x.slot_date, x.slot_time, x.slot_duration,
              x.full_name, x.email, x.phone, x.address, x.plz, x.city, x.note,
              x.einheiten AS einheiten,                      -- << DODANO (ako već nije)
              x.reason, x.canceled_by, x.canceled_by_id,
              x.created_at AS canceled_at
         FROM canceled_bookings x
         ${r.sql ? r.sql : ''}        -- filtriramo po slot_date ili po želji
        ORDER BY x.slot_date, x.slot_time`,
      r.params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'cancellations_list_failed' });
  }
});


// ---------- CSV ----------
app.get('/api/bookings.csv', ensurePrivileged, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT b.id as booking_id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note,
              b.einheiten, b.created_at, b.completed_by, b.completed_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ORDER BY s.date, s.time`
    );
    const header = [
      'booking_id','date','time','duration',
      'full_name','email','phone','address','plz','city','note','einheiten',
      'created_at','completed_by','completed_at'
    ];
    const csv = [header.join(',')]
      .concat(rows.map(r => header.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).send('csv_failed');
  }
});

// ---------- PRINT ----------
app.get('/api/bookings/:id/print', async (req, res) => {
  try {
    const row = await get(
      `SELECT b.*, b.einheiten AS units, s.date, s.time, s.duration
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
      <div><b>Einheiten</b></div><div>${row.units ?? '—'}</div>
      <div><b>Name</b></div><div>${escapeHtml(row.full_name)}</div>
      <div><b>E-Mail</b></div><div>${escapeHtml(row.email)}</div>
      <div><b>Telefon</b></div><div>${escapeHtml(row.phone || '')}</div>
      <div><b>Adresse</b></div><div>${escapeHtml(row.address || '')}</div>
      <div><b>PLZ</b></div><div>${escapeHtml(row.plz || '')}</div>
      <div><b>Stadt</b></div><div>${escapeHtml(row.city || '')}</div>
      <div><b>Notiz</b></div><div>${escapeHtml(row.note || '–')}</div>
      <div><b>Erstellt am</b></div><div>${row.created_at}</div>
      <div><b>Erledigt von</b></div><div>${row.completed_by || '—'}</div>
      <div><b>Erledigt am</b></div><div>${row.completed_at || '—'}</div>
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
