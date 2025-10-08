import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.REPLY_TO_EMAIL || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    replyTo: process.env.REPLY_TO_EMAIL || undefined,
  });
}

// 🇩🇪 njemački template
export function bookingEmails({ brand, toAdmin, toInvitee, slot, booking }) {
  const subject = `Terminbestätigung – ${slot.date} ${slot.time}`;
  const head =
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 8px">${brand} – Terminbestätigung</h2>
      <p style="color:#555;margin:0 0 16px">Vielen Dank für Ihre Buchung!</p>`;
  const tbl = (rowLabel, rowValue) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><b>${rowLabel}</b></td>
         <td style="padding:6px 10px;border:1px solid #e5e7eb">${rowValue}</td></tr>`;
  const table =
    `<table style="border-collapse:collapse;border:1px solid #e5e7eb;width:100%;margin:8px 0">
      ${tbl('Datum', slot.date)}
      ${tbl('Uhrzeit', slot.time)}
      ${tbl('Dauer', `${slot.duration} Min.`)}
      ${tbl('Name', booking.full_name)}
      ${tbl('E-Mail', booking.email)}
      ${tbl('Telefon', booking.phone)}
      ${tbl('Adresse', booking.address)}
      ${tbl('PLZ', booking.plz)}
      ${tbl('Stadt', booking.city)}
      ${tbl('Notiz', booking.note || '–')}
    </table>`;

  const footer =
    `<p style="color:#666;font-size:12px">Falls Sie Rückfragen haben, antworten Sie bitte auf diese E-Mail.</p>
     <p style="color:#666;font-size:12px">${brand}</p></div>`;

  const htmlInvitee = `${head}${table}${footer}`;

  const adminHead =
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 8px">${brand} – Neue Buchung</h2>
      <p style="color:#555;margin:0 0 16px">Ein Kunde hat soeben einen Termin gebucht.</p>`;
  const htmlAdmin = `${adminHead}${table}${footer}`;

  return { subject, htmlInvitee, htmlAdmin };
}
