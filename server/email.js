import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
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
