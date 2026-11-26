// CSPC EquiHub - Express application (CCIT 106, Weeks 5-8 structure + security hardening)
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const { db } = require('./db');
const { loadUser } = require('./middleware/auth');
const { csrfToken, globalCsrf, flash } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) { console.error('SESSION_SECRET is missing in .env'); process.exit(1); }
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---- view helpers (all output still goes through EJS escaping)
const TZ = 'Asia/Manila';
app.locals.statusLabel = { pending: 'Pending', approved: 'Approved', return_submitted: 'Return under review', returned: 'Returned',
  rejected: 'Declined', cancelled: 'Cancelled', available: 'Available', maintenance: 'Maintenance', unavailable: 'Unavailable' };
const toDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00+08:00') : new Date(d));
app.locals.fmtDate = (d) => (d ? toDate(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: TZ }) : '-');
app.locals.fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }) : '-');
const NOTIF_TYPES = [
  [/was approved/i, 'Approved', 'ok', 'Request approved'], [/was declined/i, 'Declined', 'bad', 'Request declined'],
  [/^overdue:/i, 'Overdue', 'bad', 'Return overdue'], [/overdue reminders sent/i, 'Reminders', 'info', 'Overdue reminders sent'],
  [/confirmed\./i, 'Returned', 'ok', 'Return confirmed'], [/not accepted/i, 'Proof', 'warn', 'Return proof not accepted'],
  [/suspended|privilege was restored/i, 'Account', 'purple', 'Borrowing access changed'],
  [/new borrow request/i, 'New request', 'info', 'New borrow request'], [/return proof uploaded/i, 'To verify', 'warn', 'Return proof uploaded']
];
app.locals.notifMeta = (m) => { const hit = NOTIF_TYPES.find((n) => n[0].test(m)); return hit ? { tag: hit[1], cls: hit[2], title: hit[3] } : { tag: 'Notice', cls: 'info', title: 'Notice' }; };
app.locals.qs = (f, page) => {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.departmentId) p.set('department', f.departmentId);
  if (f.categoryId) p.set('category', f.categoryId);
  if (f.availableOnly) p.set('available', '1');
  if (f.sort && f.sort !== 'name') p.set('sort', f.sort);
  if (page > 1) p.set('page', page);
  const s = p.toString();
  return s ? '?' + s : '';
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- security headers (Week 12): strict CSP = no inline script/style, no third-party origins
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));

// ---- request logger (Week 5)
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(req.method, req.originalUrl.split('?')[0], res.statusCode, (Date.now() - t) + 'ms'));
  next();
});

// ---- body parsers with size limits
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// ---- static files: ONLY dedicated folders, never the project root
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0, dotfiles: 'ignore' }));
app.use('/vendor/material-icons', express.static(path.join(__dirname, 'node_modules/material-icons/iconfont'), { maxAge: '30d' }));

// ---- sessions stored in MySQL
const store = new MySQLStore({ createDatabaseTable: true, clearExpired: true, expiration: 1000 * 60 * 60 * 8 }, db); // reuse the pool: same TLS, same connection cap
app.use(session({
  name: 'equihub.sid',
  secret: process.env.SESSION_SECRET,
  store, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(csrfToken);
app.use(globalCsrf);
app.use(flash);
app.use(loadUser);
app.use((req, res, next) => { // privacy / cookie notice: shown until the visitor accepts (cookie hh_consent)
  const pending = !/(?:^|;\s*)hh_consent=1(?:;|$)/.test(req.headers.cookie || '');
  res.locals.consentPending = pending;
  res.locals.needConsent = pending && req.path !== '/privacy'; // on /privacy the notice stays readable; the agree box sits under the text
  next();
});
app.use((req, res, next) => { res.locals.currentPath = req.path; res.locals.title = ''; next(); });

// ---- routes
app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/account', require('./routes/account'));
app.use('/admin', require('./routes/admin'));

// ---- 404, then error handler (must be last, 4 args)
app.use((req, res) => res.status(404).render('error', { title: 'Page not found', code: 404, message: 'The page you are looking for does not exist.', shell: 'public' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const code = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (code >= 500) console.error(err); // details stay in the server log, never on screen
  const message = code === 403 ? 'Your session expired or the request could not be verified. Please go back and try again.'
    : code === 413 ? 'That file is too large (max 3 MB).' : 'Something went wrong. Please try again.';
  if (res.headersSent) return next(err);
  if (req.get('x-modal') || req.get('x-fetch')) return res.status(code).json({ error: message });
  res.status(code).render('error', { title: 'Error', code, message, shell: 'public' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log('CSPC EquiHub running on http://localhost:' + PORT));
  require('./utils/overdue').start(); // automatic overdue reminders
}
module.exports = app;
