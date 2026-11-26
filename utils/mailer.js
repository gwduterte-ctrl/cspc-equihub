// Week 13 third-party integration: SMTP mailer. Disabled automatically when SMTP_HOST is empty.
const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

// text only (no HTML) so user-supplied values can never inject markup
async function sendMail(to, subject, text) {
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
    return true;
  } catch (e) { console.error('mail failed:', e.message); return false; }
}
module.exports = { sendMail };
