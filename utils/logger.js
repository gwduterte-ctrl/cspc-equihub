const { db } = require('../db');

// Writes to activity_logs. Never throws: logging must not break a request.
async function logActivity(req, action, details = null, userId = null) {
  try {
    const u = req.session && req.session.user;
    await db.query(
      'INSERT INTO activity_logs (user_id, actor_role, action, details, ip) VALUES (?, ?, ?, ?, ?)',
      [userId || (u && u.id) || null, u ? u.role : 'guest', String(action).slice(0, 60),
       details ? String(details).slice(0, 255) : null, String(req.ip || '').slice(0, 45)]
    );
  } catch (e) { console.error('log failed:', e.message); }
}
module.exports = { logActivity };
