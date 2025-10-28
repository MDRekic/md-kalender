// server/email.js
import nodemailer from 'nodemailer';

export function makeTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host, port, secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

/**
 * Generic helper: prosljeđuje SVE opcije Nodemailer-u
 * Podržano: to, cc, bcc, subject, html, text, from, replyTo, attachments...
 */
export async function sendMail({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  from,
  replyTo,
  attachments,
}) {
  const transport = makeTransport();

  // helper: normalizuj liste (dozvoli string "a@x,b@y" ili niz)
  const norm = (v) =>
    !v ? undefined
       : Array.isArray(v) ? v
       : String(v).split(',').map(s => s.trim()).filter(Boolean);

  const info = await transport.sendMail({
    from: from || process.env.SMTP_USER,
    to: norm(to),
    cc: norm(cc),
    bcc: norm(bcc),
    subject,
    html,
    text,
    replyTo: replyTo || process.env.REPLY_TO_EMAIL,
    attachments,
  });

  // korisno za debug
  console.log('[mail] sent:', {
    messageId: info.messageId,
    to: info.envelope?.to,
    cc: norm(cc),
    bcc: norm(bcc),
    subject,
  });

  return info;
}

/**
 * (ostavi ovo ako ga koristiš negdje za HTML templates)
 * bookingEmails({ brand, toAdmin, toInvitee, slot, booking, replyTo })
 */
export function bookingEmails({ brand = 'MyDienst', slot, booking }) {
  const when = `${slot.date} ${slot.time}`;
  const subject = `Termin bestätigt – ${when}`;

  const htmlInvitee = `
    <p>Guten Tag ${escapeHtml(booking.full_name)},</p>
    <p>Ihr Termin am <b>${escapeHtml(slot.date)}</b> um <b>${escapeHtml(slot.time)}</b>
       (Dauer ${escapeHtml(String(slot.duration))} Min.) wurde bestätigt.</p>
    <p>— ${escapeHtml(brand)}</p>
  `;

  const htmlAdmin = `
    <p>Neue Buchung:</p>
    <ul>
      <li><b>Kunde:</b> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</li>
      <li><b>Telefon:</b> ${escapeHtml(booking.phone || '')}</li>
      <li><b>Adresse:</b> ${escapeHtml(booking.address || '')}, ${escapeHtml(booking.plz || '')} ${escapeHtml(booking.city || '')}</li>
      <li><b>Einheiten:</b> ${escapeHtml(String(booking.units ?? '—'))}</li>
      <li><b>Datum/Zeit:</b> ${escapeHtml(slot.date)} ${escapeHtml(slot.time)} · ${escapeHtml(String(slot.duration))} Min.</li>
      <li><b>Notiz:</b> ${escapeHtml(booking.note || '—')}</li>
    </ul>
  `;

  return { subject, htmlInvitee, htmlAdmin };
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
