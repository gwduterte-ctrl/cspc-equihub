const crypto = require('crypto');
const { db } = require('../db');
const { sendMail } = require('../utils/mailer');

const SEL = 'SELECT b.id, b.reference_no, b.user_id, b.equipment_id, b.quantity, b.borrow_date, b.return_date, b.purpose, b.status, ' +
  'b.admin_note, b.return_proof, b.returned_at, b.created_at, e.name AS equipment_name, e.image AS equipment_image, ' +
  'u.full_name, u.email, u.user_type, u.id_number, u.is_blocked, c.name AS category_name, d.code AS dept_code, ' +
  'DATEDIFF(CURDATE(), b.return_date) AS days_overdue, DATEDIFF(CURDATE(), b.borrow_date) AS days_out, DATEDIFF(b.return_date, b.borrow_date) AS span_days, b.last_reminder_at, b.reminder_count, (b.status = \'approved\' AND b.return_date < CURDATE()) AS overdue ' +
  'FROM borrow_requests b JOIN equipment e ON e.id = b.equipment_id JOIN categories c ON c.id = e.category_id JOIN departments d ON d.id = c.department_id JOIN users u ON u.id = b.user_id';
const STATUSES = ['pending', 'approved', 'return_submitted', 'returned', 'rejected', 'cancelled'];

async function notify(userId, message, link = null, conn = db) {
  await conn.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [userId, message.slice(0, 255), link]);
}

// A user may not borrow again while any earlier item is not yet verified as returned.
async function outstandingFor(userId) {
  const [rows] = await db.query(
    "SELECT reference_no, status FROM borrow_requests WHERE user_id = ? AND status IN ('approved','return_submitted') LIMIT 1", [userId]);
  return rows[0];
}

async function create({ userId, equipmentId, quantity, borrowDate, returnDate, purpose }) {
  const reference = 'HH-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
  const [r] = await db.query(
    'INSERT INTO borrow_requests (reference_no, user_id, equipment_id, quantity, borrow_date, return_date, purpose) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [reference, userId, equipmentId, quantity, borrowDate, returnDate, purpose]);
  return { id: r.insertId, reference };
}

async function listForUser(userId, status = null) {
  let sql = SEL + ' WHERE b.user_id = ?'; const p = [userId];
  if (status) { sql += ' AND b.status = ?'; p.push(status); }
  return (await db.query(sql + ' ORDER BY b.created_at DESC LIMIT 100', p))[0];
}
const findForUser = async (id, userId) => (await db.query(SEL + ' WHERE b.id = ? AND b.user_id = ?', [id, userId]))[0][0];
const findById = async (id) => (await db.query(SEL + ' WHERE b.id = ?', [id]))[0][0];

async function listForAdmin({ status = null, q = '' }) {
  let sql = SEL + ' WHERE 1=1'; const p = [];
  if (status === 'overdue') sql += " AND b.status = 'approved' AND b.return_date < CURDATE()";
  else if (status) { sql += ' AND b.status = ?'; p.push(status); }
  if (q) { sql += ' AND (u.full_name LIKE ? OR b.reference_no LIKE ? OR e.name LIKE ?)'; const l = '%' + q.replace(/[%_\\]/g, '\\$&') + '%'; p.push(l, l, l); }
  return (await db.query(sql + ' ORDER BY FIELD(b.status,\'pending\',\'return_submitted\',\'approved\',\'returned\',\'rejected\',\'cancelled\'), b.created_at DESC LIMIT 200', p))[0];
}

// Approve: reserve stock atomically. The UPDATE itself refuses if stock is short.
async function approve(id, note) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.query("SELECT id, user_id, equipment_id, quantity, reference_no FROM borrow_requests WHERE id = ? AND status = 'pending' FOR UPDATE", [id]);
    if (!r) { await conn.rollback(); return { ok: false, msg: 'Request is no longer pending.' }; }
    const [[u]] = await conn.query('SELECT is_blocked FROM users WHERE id = ?', [r.user_id]);
    if (u.is_blocked) { await conn.rollback(); return { ok: false, msg: 'This user is blocked.' }; }
    const [[o]] = await conn.query("SELECT COUNT(*) AS n FROM borrow_requests WHERE user_id = ? AND status IN ('approved','return_submitted')", [r.user_id]);
    if (o.n > 0) { await conn.rollback(); return { ok: false, msg: 'This user still has unreturned equipment.' }; }
    const [s] = await conn.query("UPDATE equipment SET available_qty = available_qty - ? WHERE id = ? AND status = 'available' AND available_qty >= ?",
      [r.quantity, r.equipment_id, r.quantity]);
    if (s.affectedRows !== 1) { await conn.rollback(); return { ok: false, msg: 'Not enough available stock.' }; }
    await conn.query("UPDATE borrow_requests SET status = 'approved', admin_note = ? WHERE id = ?", [note || null, id]);
    await notify(r.user_id, 'Request ' + r.reference_no + ' was approved. Please claim your equipment.' + (note ? '\nNote: ' + note : ''), '/account/requests/' + id, conn);
    await conn.commit();
    return { ok: true, userId: r.user_id, reference: r.reference_no };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

async function reject(id, note) {
  const [[r]] = await db.query("SELECT user_id, reference_no FROM borrow_requests WHERE id = ? AND status = 'pending'", [id]);
  if (!r) return { ok: false, msg: 'Request is no longer pending.' };
  await db.query("UPDATE borrow_requests SET status = 'rejected', admin_note = ? WHERE id = ?", [note || null, id]);
  await notify(r.user_id, 'Request ' + r.reference_no + ' was declined.' + (note ? '\nNote: ' + note : ''), '/account/requests/' + id);
  return { ok: true, userId: r.user_id, reference: r.reference_no };
}

async function cancel(id, userId) {
  const [r] = await db.query("UPDATE borrow_requests SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", [id, userId]);
  return r.affectedRows === 1;
}

// Student uploads proof; stays "return_submitted" until an admin verifies it.
async function submitProof(id, userId, file) {
  const [r] = await db.query("UPDATE borrow_requests SET return_proof = ?, status = 'return_submitted' WHERE id = ? AND user_id = ? AND status IN ('approved','return_submitted')",
    [file, id, userId]);
  return r.affectedRows === 1;
}

async function confirmReturn(id, note) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.query("SELECT user_id, equipment_id, quantity, reference_no FROM borrow_requests WHERE id = ? AND status = 'return_submitted' FOR UPDATE", [id]);
    if (!r) { await conn.rollback(); return { ok: false, msg: 'No return proof is waiting for this request.' }; }
    await conn.query('UPDATE equipment SET available_qty = LEAST(available_qty + ?, total_qty) WHERE id = ?', [r.quantity, r.equipment_id]);
    await conn.query("UPDATE borrow_requests SET status = 'returned', returned_at = NOW(), admin_note = COALESCE(?, admin_note) WHERE id = ?", [note || null, id]);
    await notify(r.user_id, 'Return of ' + r.reference_no + ' confirmed. You may borrow again.' + (note ? '\nNote: ' + note : ''), '/account/requests/' + id, conn);
    await conn.commit();
    return { ok: true, userId: r.user_id, reference: r.reference_no };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

async function rejectProof(id, note) {
  const [[r]] = await db.query("SELECT user_id, reference_no FROM borrow_requests WHERE id = ? AND status = 'return_submitted'", [id]);
  if (!r) return { ok: false, msg: 'Nothing to reject.' };
  await db.query("UPDATE borrow_requests SET status = 'approved', return_proof = NULL, admin_note = ? WHERE id = ?", [note || 'Return proof was not accepted.', id]);
  await notify(r.user_id, 'Your return proof for ' + r.reference_no + ' was not accepted. Please upload a clearer photo.' + (note && note !== 'Return proof was not accepted.' ? '\nNote: ' + note : ''), '/account/requests/' + id);
  return { ok: true, userId: r.user_id, reference: r.reference_no };
}

async function statusCounts() {
  const [rows] = await db.query('SELECT status, COUNT(*) AS n FROM borrow_requests GROUP BY status');
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { c[r.status] = r.n; });
  c.all = rows.reduce((a, r) => a + r.n, 0);
  c.overdue = (await db.query("SELECT COUNT(*) AS n FROM borrow_requests WHERE status = 'approved' AND return_date < CURDATE()"))[0][0].n;
  return c;
}
// admin edit: dates / purpose / note while open; quantity only while still pending
async function updateByAdmin(id, { borrowDate, returnDate, purpose, note, quantity }) {
  const [r] = await db.query("UPDATE borrow_requests SET borrow_date = ?, return_date = ?, purpose = ?, admin_note = ?, quantity = IF(status = 'pending', ?, quantity) WHERE id = ? AND status IN ('pending','approved')",
    [borrowDate, returnDate, purpose, note, quantity, id]);
  return r.affectedRows === 1;
}
// admin delete: only finished requests (returned / declined / cancelled)
async function removeFinished(id) {
  const [[row]] = await db.query("SELECT return_proof FROM borrow_requests WHERE id = ? AND status IN ('returned','rejected','cancelled')", [id]);
  if (!row) return { ok: false };
  await db.query('DELETE FROM borrow_requests WHERE id = ?', [id]);
  return { ok: true, proof: row.return_proof };
}
// tell every admin account (shows in the admin bell / Notifications page)
async function notifyAdmins(message, link = null) {
  await db.query("INSERT INTO notifications (user_id, message, link) SELECT id, ?, ? FROM users WHERE role = 'admin'", [message.slice(0, 255), link]);
}
// numbers for the card at the bottom of the user's side menu
async function userSummary(userId) {
  const [[r]] = await db.query("SELECT COALESCE(SUM(status IN ('approved','return_submitted')), 0) AS out_n, COALESCE(SUM(status = 'approved' AND return_date < CURDATE()), 0) AS late_n FROM borrow_requests WHERE user_id = ?", [userId]);
  return { out: Number(r.out_n), late: Number(r.late_n) };
}
const recent = async (n) => (await db.query(SEL + ' ORDER BY b.created_at DESC LIMIT ?', [n]))[0];
const dueByDay = async (from, to) => (await db.query(
  "SELECT DAY(return_date) AS d, COUNT(*) AS n, MAX(return_date < CURDATE()) AS late FROM borrow_requests WHERE status = 'approved' AND return_date BETWEEN ? AND ? GROUP BY return_date", [from, to]))[0];
const dueOnDay = async (date) => (await db.query(
  SEL + " WHERE b.status = 'approved' AND b.return_date = ? ORDER BY u.full_name", [date]))[0];
async function alertCounts() {
  const [[r]] = await db.query("SELECT COALESCE(SUM(status = 'pending'), 0) AS pending, COALESCE(SUM(status = 'return_submitted'), 0) AS verify, " +
    "COALESCE(SUM(status = 'approved' AND return_date < CURDATE()), 0) AS overdue FROM borrow_requests");
  return { pending: Number(r.pending), verify: Number(r.verify), overdue: Number(r.overdue) };
}
const listOverdue = async () => (await db.query(SEL + " WHERE b.status = 'approved' AND b.return_date < CURDATE() ORDER BY b.return_date ASC LIMIT 200"))[0];

async function dashboardStats() {
  const one = async (sql) => (await db.query(sql))[0][0].n;
  const [byStatus] = await db.query('SELECT status, COUNT(*) AS n FROM borrow_requests GROUP BY status');
  const [perDay] = await db.query("SELECT DATE(created_at) AS d, COUNT(*) AS n FROM borrow_requests WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)");
  const [top] = await db.query('SELECT e.name, COUNT(*) AS n FROM borrow_requests b JOIN equipment e ON e.id = b.equipment_id GROUP BY e.id, e.name ORDER BY n DESC LIMIT 5');
  return {
    users: await one("SELECT COUNT(*) AS n FROM users WHERE role = 'user'"),
    blocked: await one("SELECT COUNT(*) AS n FROM users WHERE is_blocked = 1"),
    equipment: await one('SELECT COUNT(*) AS n FROM equipment'),
    lowStock: await one("SELECT COUNT(*) AS n FROM equipment WHERE available_qty = 0 OR status <> 'available'"),
    overdue: await one("SELECT COUNT(*) AS n FROM borrow_requests WHERE status = 'approved' AND return_date < CURDATE()"),
    awaitingReview: await one("SELECT COUNT(*) AS n FROM borrow_requests WHERE status = 'return_submitted'"),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), perDay, top
  };
}
module.exports = { notifyAdmins, userSummary, statusCounts, updateByAdmin, removeFinished, recent, dueByDay, dueOnDay, alertCounts, listOverdue, STATUSES, notify, outstandingFor, create, listForUser, findForUser, findById, listForAdmin, approve, reject, cancel, submitProof, confirmReturn, rejectProof, dashboardStats, sendMail };
