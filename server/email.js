// server/email.js
import nodemailer from 'nodemailer';

export function makeTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Generiše subject + HTML za potvrdu rezervacije:
 *  - htmlInvitee: mail za kupca
 *  - htmlAdmin: mail za admina
 */
export function bookingEmails({ brand, toInvitee, toAdmin, slot, booking, replyTo }) {
  const when = `${slot.date} ${slot.time}`;
  const subject = `Terminbestätigung – ${when}`;

  const baseTable = (extraRows = '') => `
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      <tr><td><b>Datum</b></td><td>${slot.date}</td></tr>
      <tr><td><b>Uhrzeit</b></td><td>${slot.time}</td></tr>
      <tr><td><b>Dauer</b></td><td>${slot.duration} Min.</td></tr>
      <tr><td><b>Einheiten</b></td><td>${booking.units ?? '—'}</td></tr>
      <tr><td><b>Name</b></td><td>${booking.full_name}</td></tr>
      <tr><td><b>E-Mail</b></td><td>${booking.email}</td></tr>
      <tr><td><b>Telefon</b></td><td>${booking.phone || ''}</td></tr>
      <tr><td><b>Adresse</b></td><td>${booking.address || ''}</td></tr>
      <tr><td><b>PLZ</b></td><td>${booking.plz || ''}</td></tr>
      <tr><td><b>Stadt</b></td><td>${booking.city || ''}</td></tr>
      <tr><td><b>Notiz</b></td><td>${booking.note || '—'}</td></tr>
      ${extraRows}
    </table>
  `;

  const htmlInvitee = `
    <p>Guten Tag ${booking.full_name},</p>
    <p>vielen Dank für Ihre Terminbuchung bei <b>${brand}</b>.</p>
    ${baseTable()}
    <p>Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.</p>
  `;

  const htmlAdmin = `
    <p>Neue Buchung eingegangen:</p>
    ${baseTable(`<tr><td><b>Empfänger</b></td><td>${toInvitee}</td></tr>`)}
  `;

  return { subject, htmlInvitee, htmlAdmin };
}

/** Jednostavan helper za slanje maila jednim pozivom */
export async function sendMail({ to, cc, subject, html, replyTo }) {
  const transport = makeTransport();
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    cc,
    subject,
    html,
    replyTo,
  });
}
