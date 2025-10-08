import nodemailer from 'nodemailer';

export async function sendMail({ to, subject, html, text }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const fromAddr = process.env.REPLY_TO_EMAIL || process.env.SMTP_USER;
  await transporter.sendMail({
    from: fromAddr,
    to,
    subject,
    html,
    text,
    replyTo: fromAddr,
  });
}
