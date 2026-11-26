const { db } = require('../db');
const COLS = 'id, full_name, email, password_hash, google_id, email_verified, user_type, id_number, department_id, role, is_blocked, block_reason, created_at';

const findByEmail = async (email) => (await db.query('SELECT ' + COLS + ' FROM users WHERE email = ?', [email]))[0][0];
const findById = async (id) => (await db.query('SELECT ' + COLS + ' FROM users WHERE id = ?', [id]))[0][0];
const findByGoogleId = async (gid) => (await db.query('SELECT ' + COLS + ' FROM users WHERE google_id = ?', [gid]))[0][0];

async function create({ fullName, email, passwordHash = null, googleId = null, verified = false, tokenHash = null, userType = 'student', idNumber = null, departmentId = null }) {
  const [r] = await db.query(
    'INSERT INTO users (full_name, email, password_hash, google_id, email_verified, verify_token, verify_expires, user_type, id_number, department_id) ' +
    'VALUES (?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, DATE_ADD(NOW(), INTERVAL 24 HOUR)), ?, ?, ?)',
    [fullName, email, passwordHash, googleId, verified ? 1 : 0, tokenHash, tokenHash, userType, idNumber, departmentId]);
  return r.insertId;
}
async function verifyByToken(tokenHash) {
  const [r] = await db.query('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE verify_token = ? AND verify_expires > NOW()', [tokenHash]);
  return r.affectedRows === 1;
}
const linkGoogle = (id, gid) => db.query('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?', [gid, id]);
async function updateProfile(id, { fullName, userType, idNumber, departmentId }) {
  await db.query('UPDATE users SET full_name = ?, user_type = ?, id_number = ?, department_id = ? WHERE id = ?',
    [fullName, userType, idNumber, departmentId, id]);
}
const setPassword = (id, hash) => db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);

async function listForAdmin(q = '', role = 'user') {
  const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
  return (await db.query(
    "SELECT u.id, u.full_name, u.email, u.user_type, u.id_number, u.is_blocked, u.block_reason, d.code AS dept_code, " +
    "(SELECT COUNT(*) FROM borrow_requests b WHERE b.user_id = u.id AND b.status IN ('approved','return_submitted')) AS outstanding " +
    "FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.role = ? AND (u.full_name LIKE ? OR u.email LIKE ?) " +
    "ORDER BY u.created_at DESC LIMIT 200", [role, like, like]))[0];
}
async function setBlocked(id, blocked, reason) {
  const [r] = await db.query("UPDATE users SET is_blocked = ?, block_reason = ? WHERE id = ? AND role = 'user'",
    [blocked ? 1 : 0, blocked ? reason : null, id]);
  return r.affectedRows === 1;
}
async function createByAdmin({ fullName, email, passwordHash, role, userType, idNumber, departmentId }) {
  const [r] = await db.query('INSERT INTO users (full_name, email, password_hash, email_verified, role, user_type, id_number, department_id) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
    [fullName, email, passwordHash, role, userType, idNumber, departmentId]);
  return r.insertId;
}
async function updateByAdmin(id, { fullName, userType, idNumber, departmentId, role, passwordHash }) {
  await db.query('UPDATE users SET full_name = ?, user_type = ?, id_number = ?, department_id = ?, role = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?',
    [fullName, userType, idNumber, departmentId, role, passwordHash, id]);
}
const remove = async (id) => (await db.query('DELETE FROM users WHERE id = ?', [id]))[0].affectedRows === 1;
module.exports = { createByAdmin, updateByAdmin, remove, findByEmail, findById, findByGoogleId, create, verifyByToken, linkGoogle, updateProfile, setPassword, listForAdmin, setBlocked };
