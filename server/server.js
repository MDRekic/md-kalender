// server/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

import { all, get, migrate, run } from './db.js';
import { sendMail } from './email.js';
import { issueToken, verifyToken } from './auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5174);

/* ----------------------------- helpers ----------------------------- */
const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/* ---------------------------- migrations --------------------------- */
migrate();

// add units column to canceled_bookings if missing
await run(`CREATE TABLE IF NOT EXISTS canceled_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  slot_date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  slot_duration INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  plz TEXT,
  city TEXT,
  units INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  reason TEXT NOT NULL,
  canceled_by TEXT,
  canceled_by_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);




/* -------------------------- seed admin user ------------------------ */
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

/* ------------------------- security & parsers ---------------------- */
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());

/* ------------------------------- CORS ------------------------------ */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

/* ----------------------------- rate limit -------------------------- */
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }));
app.use('/api/bookings', rateLimit({ windowMs: 60_000, max: 100 }));

/* ---------------------------- auth guards -------------------------- */
function ensureAdmin(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.role || decoded.role !== 'admin') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = decoded;
  next();
}

// admin ili user (operater)
function ensurePrivileged(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded?.role || !['admin', 'user'].includes(decoded.role)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = decoded;
  next();
}

function ensureStaff(req, res, next) {
  const token = req.cookies?.admtk;
  const decoded = token && verifyToken(token, process.env.JWT_SECRET || 'secret');
  if (!decoded) return res.status(401).json({ error: 'unauthorized' });
  if (!['admin','user'].includes(decoded.role || (decoded.admin ? 'admin' : ''))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.user = decoded; // { uid, username, role, admin:bool ... }
  next();
}



/* ------------------------------- AUTH ------------------------------ */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });

    const user = await get(
      'SELECT id, username, password_hash, role, email FROM users WHERE username=?',
      [username]
    );
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

/* ------------------------- USER MANAGEMENT ------------------------- */
// samo admin
app.post('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, role = 'user', email = null } = req.body || {};
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

/* ------------------------------- SLOTS ----------------------------- */
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

// dodavanje i brisanje slotova – samo admin
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

/* ----------------------------- BOOKINGS --------------------------- */
// public – kreiranje
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      slotId, fullName, email, phone, address, plz, city, units, note
    } = req.body || {};

    // validacija
    if (!slotId || !fullName || !email || !phone || !address || !plz || !city) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const unitsNum = Number.isFinite(+units) ? Math.max(0, parseInt(units, 10)) : 0;

    const slot = await get('SELECT * FROM slots WHERE id=?', [slotId]);
    if (!slot) return res.status(404).json({ error: 'slot_not_found' });
    if (slot.status === 'booked') return res.status(409).json({ error: 'already_booked' });

    // 👇 VAŽNO: redoslijed kolona i vrijednosti!
    const { id: bookingId } = await run(
      'INSERT INTO bookings (slot_id, full_name, email, phone, address, plz, city, units, note) VALUES (?,?,?,?,?,?,?,?,?)',
      [slotId, fullName, email, phone, address, plz, city, unitsNum, note || null]
    );
    await run('UPDATE slots SET status="booked" WHERE id=?', [slotId]);


    // ✉️ pošalji mailove asinkrono – koristimo sendMail koji već radi
    setImmediate(async () => {
      try {
        const brand   = process.env.BRAND_NAME || 'MyDienst';
        const when    = `${slot.date} ${slot.time}`;
        const replyTo = process.env.REPLY_TO_EMAIL || process.env.SMTP_USER || 'termin@mydienst.de';

        const inviteeSubject = `Bestätigung – ${when}`;
        const inviteeHtml = `
          <p>Guten Tag ${escapeHtml(fullName)},</p>
          <p>vielen Dank für Ihre Buchung.</p>
          <ul>
            <li><b>Datum/Zeit:</b> ${slot.date} ${slot.time}</li>
            <li><b>Dauer:</b> ${slot.duration} Min.</li>
            <li><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</li>
            <li><b>Telefon:</b> ${escapeHtml(phone)}</li>
            <li><b>Einheiten (Klingeln):</b> ${Number(units)}</li>
            ${note ? `<li><b>Notiz:</b> ${escapeHtml(note)}</li>` : ``}
          </ul>
          <p>Mit freundlichen Grüßen<br/>${brand}</p>
        `;

        const adminSubject = `Neue Buchung – ${when}`;
        const adminHtml = `
          <p>Neue Buchung:</p>
          <ul>
            <li><b>Datum/Zeit:</b> ${slot.date} ${slot.time} · ${slot.duration} Min.</li>
            <li><b>Kunde:</b> ${escapeHtml(fullName)} (${escapeHtml(email)})</li>
            <li><b>Telefon:</b> ${escapeHtml(phone)}</li>
            <li><b>Adresse:</b> ${escapeHtml(address)}, ${escapeHtml(plz)} ${escapeHtml(city)}</li>
            <li><b>Einheiten:</b> ${Number(units)}</li>
            ${note ? `<li><b>Notiz:</b> ${escapeHtml(note)}</li>` : ``}
          </ul>
        `;

        await sendMail({ to: email, subject: inviteeSubject, html: inviteeHtml, replyTo });
        if (process.env.ADMIN_EMAIL) {
          await sendMail({ to: process.env.ADMIN_EMAIL, subject: adminSubject, html: adminHtml, replyTo });
        }
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

/* -------------- ADMIN BOOKINGS LIST (with optional filter) -------- */
app.get('/api/admin/bookings', ensurePrivileged, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const params = [];
    let where = ' WHERE b.completed_at IS NULL';
    if (from) {
      where += ' AND s.date >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND s.date >= ?';
      params.push(to);
    }

    const rows = await all(
  `SELECT b.id, s.date, s.time, s.duration,
          b.full_name, b.email, b.phone, b.address, b.plz, b.city,
          b.units, b.note,
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

app.get('/api/admin/completed', ensurePrivileged, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const r = rangeWhere(from, to);              // filtriramo po datumu slota (s.date)
    const rows = await all(
  `SELECT b.id, s.date, s.time, s.duration,
          b.full_name, b.email, b.phone, b.address, b.plz, b.city,
          b.units, b.note,
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



/* --------------------- COMPLETE (Fertig) --------------------------- */
// admin i operater
app.post('/api/admin/bookings/:id/complete', ensurePrivileged, async (req, res) => {
  const id = req.params.id;
  const completedBy = req.user?.username || 'system';
  try {
    await run(
      'UPDATE bookings SET completed_at=datetime("now"), completed_by=? WHERE id=?',
      [completedBy, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'complete_failed' });
  }
});

/* ---------------- Delete booking (sa razlogom + mail) ------------- */
// STORNIRAJ (arhiviraj) REZERVACIJU + oslobodi slot + pošalji mailove
// STORNIRAJ REZERVACIJU (admin + operater): arhiviraj u canceled_bookings,
// oslobodi slot i pošalji e-mailove
app.delete('/api/admin/bookings/:id', ensurePrivileged, async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'reason_required' });
  }

  try {
    // 1) Učitaj postojeću rezervaciju i slot
    const row = await get(
      `SELECT b.*, s.date  AS slot_date,
               s.time     AS slot_time,
               s.duration AS slot_duration,
               s.id       AS slot_id
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
        WHERE b.id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'not_found' });

    // 2) Upis u canceled_bookings (AUDIT)
    await run(
      `INSERT INTO canceled_bookings
         (booking_id, slot_date, slot_time, slot_duration,
          full_name, email, phone, address, plz, city, note,
          reason, canceled_by, canceled_by_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        row.id,                 // booking_id
        row.slot_date,          // slot_date
        row.slot_time,          // slot_time
        row.slot_duration,      // slot_duration
        row.full_name,          // full_name
        row.email,              // email
        row.phone,              // phone
        row.address,            // address
        row.plz,                // plz
        row.city,               // city
        row.note || null,       // note
        reason.trim(),          // reason
        req.user?.username || 'system', // canceled_by
        req.user?.uid || null           // canceled_by_id
      ]
    );

    // 3) Obriši rezervaciju i oslobodi slot
    await run(`DELETE FROM bookings WHERE id=?`, [id]);
    await run(`UPDATE slots SET status='free' WHERE id=?`, [row.slot_id]);

    // 4) E-mail obavijesti
    const when = `${row.slot_date} ${row.slot_time}`;
    const subject = `Termin storniert – ${when}`;
    const htmlInvitee = `
      <p>Guten Tag ${escapeHtml(row.full_name)},</p>
      <p>Ihr Termin am <b>${row.slot_date}</b> um <b>${row.slot_time}</b> (Dauer ${row.slot_duration} Min.) wurde storniert.</p>
      <p><b>Grund:</b> ${escapeHtml(reason)}</p>
      <p>— ${process.env.BRAND_NAME || 'MyDienst'}</p>
    `;
    await sendMail({ to: row.email, subject, html: htmlInvitee });
    await sendMail({
      to: process.env.ADMIN_EMAIL,
      subject: `ADMIN: ${subject}`,
      html: `
        <p>Storno erfasst.</p>
        <ul>
          <li><b>Kunde:</b> ${escapeHtml(row.full_name)} (${escapeHtml(row.email)})</li>
          <li><b>Telefon:</b> ${escapeHtml(row.phone || '')}</li>
          <li><b>Adresse:</b> ${escapeHtml(row.address || '')}, ${escapeHtml(row.plz || '')} ${escapeHtml(row.city || '')}</li>
          <li><b>Datum/Zeit:</b> ${row.slot_date} ${row.slot_time} · ${row.slot_duration} Min.</li>
          <li><b>Grund:</b> ${escapeHtml(reason)}</li>
          <li><b>Storniert von:</b> ${escapeHtml(req.user?.username || '')}</li>
        </ul>`
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[storno]', e);
    res.status(500).json({ error: 'server_error' });
  }
});


// LISTA STORNA (admin i user), filter po datumu slota
// LISTA STORNA (admin & user), filtriranje po datumu slota
app.get('/api/admin/cancellations', ensurePrivileged, async (req, res) => {
  const { from, to } = req.query || {};
  const params = [];
  let where = 'WHERE 1=1';
  if (from) { where += ' AND x.slot_date >= ?'; params.push(from); }
  if (to)   { where += ' AND x.slot_date <= ?'; params.push(to); }

  const baseSql = `
    SELECT x.id, x.booking_id,
           x.slot_date, x.slot_time, x.slot_duration,
           x.full_name, x.email, x.phone, x.address, x.plz, x.city, x.note,
           x.reason, x.canceled_by, x.canceled_by_id,
           x.created_at AS canceled_at
      FROM canceled_bookings x
      ${where}
      ORDER BY x.slot_date, x.slot_time
  `;

  try {
    let rows;
    try {
      // pokušaj s created_at
      rows = await all(baseSql, params);
    } catch (e) {
      // fallback ako kolona ne postoji
      if (String(e).includes('no such column: x.created_at')) {
        const fallbackSql = baseSql.replace(',\n           x.created_at AS canceled_at', '');
        rows = await all(fallbackSql, params);
        rows = rows.map(r => ({ ...r, canceled_at: null }));
      } else {
        throw e;
      }
    }
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'cancellations_list_failed' });
  }
});



/* ------------------------------- CSV ------------------------------- */
app.get('/api/bookings.csv', ensurePrivileged, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT b.id as booking_id, s.date, s.time, s.duration,
              b.full_name, b.email, b.phone, b.address, b.plz, b.city, b.units, b.note,
              b.created_at, b.completed_by, b.completed_at
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         ORDER BY s.date, s.time`
    );
    const header = [
      'booking_id','date','time','duration',
      'full_name','email','phone','address','plz','city','note',
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

/* ------------------------------- PRINT ----------------------------- */
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
      <div><b>Einheiten</b></div><div>${row.units}</div>
      <div><b>Notiz</b></div><div>${row.note || '–'}</div>
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

/* ------------------------------ START ------------------------------ */
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
