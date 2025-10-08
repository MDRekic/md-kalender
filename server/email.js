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
