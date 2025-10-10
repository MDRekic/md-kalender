import nodemailer from "nodemailer";

export function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendMail({ to, subject, html, text }) {
  const transporter = makeTransport();
  const from = process.env.REPLY_TO_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
    replyTo: from,
  });
}

// univerzalni predlošci za e-mail poruke
export const bookingEmails = {
  confirmation: (data) => ({
    subject: `Terminbestätigung – ${data.date} um ${data.time}`,
    text: `Sehr geehrte/r ${data.fullName},

Ihr Termin am ${data.date} um ${data.time} wurde erfolgreich gebucht.

Adresse: ${data.address}, ${data.plz} ${data.city}
Dauer: ${data.duration} Minuten

Mit freundlichen Grüßen
${process.env.BRAND_NAME || "MyDienst GmbH"}`,
  }),

  cancellation: (data) => ({
    subject: `Termin storniert – ${data.date} um ${data.time}`,
    text: `Sehr geehrte/r ${data.fullName},

Ihr Termin am ${data.date} um ${data.time} wurde storniert.

Grund: ${data.reason || "kein Grund angegeben"}

Mit freundlichen Grüßen
${process.env.BRAND_NAME || "MyDienst GmbH"}`,
  }),
};

export function bookingEmails({ brand, toAdmin, toInvitee, slot, booking, replyTo }) {
  const when = `${slot.date} ${slot.time}`;
  const subject = `${brand}: Termin ${when}`;

  const htmlInvitee = `
    <p>Guten Tag ${booking.full_name},</p>
    <p>Ihr Termin am <b>${slot.date}</b> um <b>${slot.time}</b> (Dauer ${slot.duration} Min.) ist bestätigt.</p>
    ${Number.isFinite(+booking.einheiten) ? `<p>Einheiten: <b>${booking.einheiten}</b></p>` : ``}
    <p>Viele Grüße – ${brand}</p>
  `;

  const htmlAdmin = `
    <p>Neue Buchung:</p>
    <ul>
      <li><b>Wann:</b> ${slot.date} ${slot.time} (${slot.duration} Min.)</li>
      <li><b>Kunde:</b> ${booking.full_name} (${booking.email}${booking.phone ? ', ' + booking.phone : ''})</li>
      <li><b>Adresse:</b> ${booking.address || ''}, ${booking.plz || ''} ${booking.city || ''}</li>
      ${Number.isFinite(+booking.einheiten) ? `<li><b>Einheiten:</b> ${booking.einheiten}</li>` : ``}
      ${booking.note ? `<li><b>Notiz:</b> ${booking.note}</li>` : ``}
    </ul>
  `;

  return { subject, htmlInvitee, htmlAdmin };
}

export async function sendMail({ to, subject, html, replyTo }) {
  const transport = makeTransport(); // tvoj postojeći makeTransport ostaje u ovoj datoteci
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html,
    replyTo,
  });
}
