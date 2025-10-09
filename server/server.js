// server/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

import { all, get, migrate, run } from './db.js';
import { makeTransport, bookingEmails } from './email.js';
import { sendMail } from './email.js';
import { issueToken, verifyToken } from './auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);

// ───────────────────────────────────────────────────────────────────────────────
// helpers
const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// DB migracije
migrate();

run(`ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'active'`).catch(() => {});

// seed admin user ako ne postoji
async function ensureAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const envHash = process.env.ADMIN_PASS_HASH || '';
  const row = await get('SELECT id FROM users WHERE username=?', [username]);
  if (!row) {
    const password_hash = envHash && envHash.length > 0
      ? envHash
      : await bcrypt.hash('admin', 10);
    await run(
      'INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)',
      [username, password_hash, 'admin', process.env.ADMIN_EMAIL || null]
    );
    console.log(`[users] Seed admin created: ${username}${envHash ? ' (from .env hash)' : ' (default pass: "admin")'}`);
  }
}
ensureAdminUser().catch(console.error);

// security & parsers
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// rate limit
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }));
app.use('/api/bookings', rateLimit({ windowMs: 60_000, max: 100 }));

// ───────────────────────────────────────────────────────────────────────────────
// admin auth helper
function ensureAdmin(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.admin) return res.status(401).json({ error: 'unauthorized' });
  req.admin = decoded;
  next();
}

// ───────────────────────────────────────────────────────────────────────────────
// AUTH
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });

    const user = await get(
      'SELECT id, username, password_hash, role FROM users WHERE username=?',
      [username]
    );
    if (!user) return res.status(401).json({ error: 'bad_credentials' });

    const okPass = await bcrypt.compare(password, user.password_hash || '');
    if (!okPass) return res.status(401).json({ error: 'bad_credentials' });

    const token = issueToken(
      { admin: user.role === 'admin', username: user.username, uid: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret'
    );
    res.cookie('admtk', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,             // stavi true kad ideš full HTTPS iza proxyja
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
  res.json({ admin: !!decoded?.admin, user: decoded || null });
});

// ───────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT (opciono)
app.post('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, role = 'admin', email = null } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
    const exists = await get('SELECT id FROM users WHERE username=?', [username]);
    if (exists) return res.status(409).json({ error: 'user_exists' });
    const password_hash = await bcrypt.hash(password, 10);
    const { id } = await run(
      'INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)',
      [username, password_hash, role, email]
    );
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

// ───────────────────────────────────────────────────────────────────────────────
// SLOTS
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


// BULK: kreiraj više slotova odjednom
app.post('/api/slots/bulk', ensureAdmin, async (req, res) => {
  try {
    const { from, to, time, duration = 120, daysOfWeek } = req.body || {};
    // daysOfWeek: niz integera 1..7 (1=Mon, 7=Sun)

    if (!from || !to || !time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const wantedDays = Array.isArray(daysOfWeek) && daysOfWeek.length
      ? new Set(daysOfWeek.map(Number))
      : new Set([1,2,3,4,5,6,7]); // ako nije dato, sve dane

    const start = new Date(from + 'T00:00:00');
    const end   = new Date(to   + 'T00:00:00');
    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({ error: 'bad_range' });
    }

    let created = 0, skipped = 0, conflicts = 0;

    await run('BEGIN');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // 1=Mon ... 7=Sun (ISO day)
      const day = ((d.getDay() + 6) % 7) + 1;
      if (!wantedDays.has(day)) continue;

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dd}`;

      // postoji li već slot za taj datum+vrijeme?
      const exists = await get('SELECT id, status FROM slots WHERE date=? AND time=?', [dateStr, time]);
      if (exists) {
        // ako je već bukiran ili već postoji – preskoči kao konflikt/skip
        conflicts += (exists.status === 'booked') ? 1 : 0;
        skipped   += (exists.status !== 'booked') ? 1 : 0;
        continue;
      }

      await run('INSERT INTO slots (date,time,duration,status) VALUES (?,?,?,?)', [dateStr, time, duration, 'free']);
      created++;
    }
    await run('COMMIT');

    res.json({ created, skipped, conflicts });
  } catch (e) {
    console.error(e);
    try { await run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: 'bulk_create_failed' });
  }
});



// ───────────────────────────────────────────────────────────────────────────────
// BOOKINGS (public POST)
app.post('/api/bookings', async (req, res) => {
  try {
    const { slotId, fullName, email, phone, address, plz, city, note } = req.body || {};
    if (!slotId || !fullName || !email || !phone || !address || !plz || !city) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const slot = await get('SELECT * FROM slots WHERE id=?', [slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status === 'booked') return res.status(409).json({ error: 'already_booked' });

    // 1) upis u DB
    const { id: bookingId } = await run(
      'INSERT INTO bookings (slot_id, full_name, email, phone, address, plz, city, note) VALUES (?,?,?,?,?,?,?,?)',
      [slotId, fullName, email, phone, address, plz, city, note || null]
    );
    await run('UPDATE slots SET status="booked" WHERE id=?', [slotId]);

    // 2) ODMAH vrati uspjeh klijentu – da ne “visi” ako mailovi padnu
    res.json({ bookingId, slotId });

    // 3) Mailovi u pozadini, uz try/catch da ne ruše request
setImmediate(async () => {
  try {
    const brand   = process.env.BRAND_NAME || 'MyDienst';
    const replyTo = process.env.REPLY_TO_EMAIL || 'termin@mydienst.de';

    const when    = `${slot.date} ${slot.time}`;
    const subject = `Termin bestätigt – ${when}`;

    const inviteeHtml = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45">
        <p>Guten Tag ${escapeHtml(fullName)},</p>
        <p>Ihr Termin wurde erfolgreich gebucht.</p>
        <ul>
          <li><b>Datum/Zeit:</b> ${slot.date} ${slot.time}</li>
          <li><b>Dauer:</b> ${slot.duration} Min.</li>
          <li><b>Name:</b> ${escapeHtml(fullName)}</li>
          <li><b>E-Mail:</b> ${escapeHtml(email)}</li>
          <li><b>Telefon:</b> ${escapeHtml(phone)}</li>
          <li><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</li>
          ${note ? `<li><b>Notiz:</b> ${escapeHtml(note)}</li>` : ''}
        </ul>
        <p>Beste Grüße<br/>${brand}</p>
      </div>
    `;

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45">
        <p><b>Neue Buchung</b></p>
        <ul>
          <li><b>Datum/Zeit:</b> ${slot.date} ${slot.time} (${slot.duration} Min.)</li>
          <li><b>Kunde:</b> ${escapeHtml(fullName)}</li>
          <li><b>E-Mail:</b> ${escapeHtml(email)}</li>
          <li><b>Telefon:</b> ${escapeHtml(phone)}</li>
          <li><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</li>
          ${note ? `<li><b>Notiz:</b> ${escapeHtml(note)}</li>` : ''}
          <li><b>Slot-ID:</b> ${slot.id} · <b>Buchung-ID:</b> ${bookingId}</li>
        </ul>
      </div>
    `;

    // kupac
    await sendMail({
      to: email,
      subject,
      html: inviteeHtml,
      replyTo,
    });

    // admin (ako je postavljen)
    if (process.env.ADMIN_EMAIL) {
      await sendMail({
        to: process.env.ADMIN_EMAIL,
        subject: `Neue Buchung – ${subject}`,
        html: adminHtml,
        replyTo,
      });
    }
  } catch (err) {
    console.error('[mail after booking]', err);
  }
});

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'booking_failed' });
  }
});

// ADMIN – list
// LIST (admin)
app.get('/api/admin/bookings', ensureAdmin, async (req, res) => {
  try {
    const { from, to, status = 'active' } = req.query;

    const where = [];
    const params = [];

    if (status && status !== 'all') {
      where.push('COALESCE(b.status, "active") = ?');
      params.push(status);
    }
    if (from) {
      where.push('s.date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('s.date <= ?');
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await all(
      `SELECT b.id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note,
              COALESCE(b.status, 'active') as status,
              b.created_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ${whereSql}
         ORDER BY s.date, s.time`,
      params
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'bookings_list_failed' });
  }
});


// CSV (admin) – ista logika filtera
app.get('/api/bookings.csv', ensureAdmin, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    let rows;

    const base =
      `SELECT b.id as booking_id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.note, b.created_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id`;

    if (from && to) {
      rows = await all(`${base} WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.time`, [from, to]);
    } else if (from) {
      rows = await all(`${base} WHERE s.date >= ? ORDER BY s.date, s.time`, [from]);
    } else if (to) {
      rows = await all(`${base} WHERE s.date <= ? ORDER BY s.date, s.time`, [to]);
    } else {
      rows = await all(`${base} ORDER BY s.date, s.time`);
    }

    const header = ['booking_id','date','time','duration','full_name','email','phone','address','plz','city','note','created_at'];
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

// Mark as done (Erledigt)
app.patch('/api/admin/bookings/:id/done', ensureAdmin, async (req, res) => {
  try {
    const { changes } = await run(
      `UPDATE bookings SET status='done' WHERE id=?`,
      [req.params.id]
    );
    res.json({ updated: changes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'mark_done_failed' });
  }
});



// PRINT
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
      <div><b>PLZ</b></div><div>${row.plz}</div>
      <div><b>Stadt</b></div><div>${row.city}</div>
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
