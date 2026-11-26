const { db } = require('../db');

// Re-reads the user on every request so a block or role change takes effect at once.
async function loadUser(req, res, next) {
  try {
    res.locals.user = null; res.locals.unread = 0;
    const id = req.session.userId;
    if (!id) return next();
    const [rows] = await db.query(
      'SELECT id, full_name, email, user_type, role, is_blocked, block_reason FROM users WHERE id = ?', [id]);
    if (!rows[0]) { req.session.destroy(() => {}); return next(); }
    req.session.user = rows[0];
    res.locals.user = rows[0];
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [id]);
    res.locals.unread = c.n;
    next();
  } catch (e) { next(e); }
}

function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'user') {
    if (req.get('x-modal')) { // pop-up request from a guest: tell the page to go to login, then come back
      req.session.returnTo = safeReturn(req.get('x-origin'), '/'); // come back to the page they clicked on...
      if (req.method === 'GET' && /^\/borrow\/\d+$/.test(req.originalUrl)) req.session.reopen = req.originalUrl; // ...and reopen the form there
      return res.status(401).json({ login: '/login' });
    }
    req.session.returnTo = req.method === 'GET' ? req.originalUrl : '/equipments';
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  next();
}

// only same-site relative paths may be used as a post-login redirect (open-redirect guard)
function safeReturn(p, fallback) {
  return typeof p === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(p) ? p : fallback;
}

module.exports = { loadUser, requireUser, requireAdmin, safeReturn };
