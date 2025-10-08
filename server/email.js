import nodemailer from 'nodemailer';

export function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: !!Number(process.env.SMTP_SECURE || 0),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
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
     `<table ...>
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
