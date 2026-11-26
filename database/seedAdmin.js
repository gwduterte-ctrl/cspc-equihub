// npm run seed:admin  - creates/updates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
const bcrypt = require('bcryptjs');
const { db } = require('../db');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';
  if (!email || pass.length < 10) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of 10+ characters in .env');
  const hash = await bcrypt.hash(pass, 12);
  await db.query(
    "INSERT INTO users (full_name, email, password_hash, email_verified, user_type, role) VALUES ('EquiHub Admin', ?, ?, 1, 'employee', 'admin') " +
    "ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin', email_verified = 1", [email, hash]);
  console.log('Admin ready:', email);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
