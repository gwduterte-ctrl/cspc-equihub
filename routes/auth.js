const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const Users = require('../models/userModel');
const Catalog = require('../models/catalogModel');
const { collectErrors } = require('../middleware/security');
const { safeReturn } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { sendMail } = require('../utils/mailer');

const router = Router();
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // equalises timing for unknown e-mails
const USER_TYPES = ['student', 'faculty', 'employee'];
const allowedDomains = () => (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const domainOk = (email) => { const d = allowedDomains(); return d.length === 0 || d.includes(email.split('@')[1]); };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => req.get('x-fetch') ? res.status(429).json({ ok: false, error: 'Too many attempts. Please wait 15 minutes.' }) : res.status(429).render('error', { title: 'Too many attempts', code: 429, message: 'Too many attempts. Please wait 15 minutes and try again.', shell: 'public' }) });

function startSession(req, user, cb) {
  const returnTo = req.session.returnTo;
  const reopen = req.session.reopen;
  req.session.regenerate((err) => { // new session id on login: prevents session fixation
    if (err) return cb(err);
    req.session.userId = user.id;
    req.session.greet = true;
    if (reopen) req.session.reopen = reopen;
    cb(null, returnTo);
  });
}

// ---------------- user login ----------------
router.get('/login', (req, res) => {
  if (req.session.user && req.session.user.role === 'user') return res.redirect('/equipments');
  res.render('auth/login', { title: 'Log in', shell: 'auth', errors: [], old: {}, googleOn: !!process.env.GOOGLE_CLIENT_ID });
});

router.post('/login', authLimiter,
  [body('email').trim().isEmail().isLength({ max: 160 }).normalizeEmail({ gmail_remove_dots: false }), body('password').isString().isLength({ min: 1, max: 200 })],
  h(async (req, res, next) => {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 160);
    const fail = (msg, code = 401) => req.get('x-fetch') ? res.status(code).json({ ok: false, error: msg }) : res.status(code).render('auth/login', { title: 'Log in', shell: 'auth', errors: [msg], old: { email }, googleOn: !!process.env.GOOGLE_CLIENT_ID });
    if (collectErrors(req).length) return fail('Enter your e-mail and password.', 422);
    const u = await Users.findByEmail(email);
    const ok = await bcrypt.compare(String(req.body.password), (u && u.password_hash) || DUMMY_HASH);
    if (!u || !u.password_hash || !ok || u.role !== 'user') { await logActivity(req, 'login_failed', email); return fail('Incorrect e-mail or password.'); }
    if (!u.email_verified) return fail('Please verify your e-mail first. Check your inbox for the confirmation link.', 403);
    await logActivity(req, 'login', 'password', u.id);
    startSession(req, u, (err, returnTo) => {
      if (err) return next(err);
      const to = safeReturn(returnTo, '/');
      return req.get('x-fetch') ? res.json({ ok: true, redirect: to }) : res.redirect(303, to);
    });
  }));

// ---------------- sign up ----------------
router.get('/register', async (req, res) => {
  res.render('auth/register', { title: 'Create account', shell: 'auth', errors: [], old: {}, departments: await Catalog.listDepartments(), googleOn: !!process.env.GOOGLE_CLIENT_ID, domains: allowedDomains() });
});

router.post('/register', authLimiter,
  [
    body('full_name').trim().isLength({ min: 2, max: 120 }).withMessage('Enter your full name.'),
    body('email').trim().isEmail().withMessage('Enter a valid e-mail.').isLength({ max: 160 }),
    body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be 10-128 characters.'),
    body('confirm').custom((v, { req }) => v === req.body.password).withMessage('Passwords do not match.'),
    body('user_type').isIn(USER_TYPES).withMessage('Choose student, faculty or employee.'),
    body('id_number').trim().isLength({ max: 30 }).withMessage('ID number is too long.').matches(/^[\w\- ]*$/).withMessage('ID number has invalid characters.'),
    body('department_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid department.'),
    body('privacy').equals('yes').withMessage('Please accept the privacy notice.')
  ],
  h(async (req, res, next) => {
    const b = req.body;
    const old = { full_name: String(b.full_name || '').slice(0, 120), email: String(b.email || '').slice(0, 160), user_type: String(b.user_type || ''), id_number: String(b.id_number || '').slice(0, 30), department_id: String(b.department_id || '') };
    const errors = collectErrors(req);
    const email = old.email.trim().toLowerCase();
    if (!errors.length && !domainOk(email)) errors.push('Please use your CSPC e-mail (' + allowedDomains().map((d) => '@' + d).join(' or ') + ').');
    const rerender = async (code) => res.status(code).render('auth/register', { title: 'Create account', shell: 'auth', errors, old, departments: await Catalog.listDepartments(), googleOn: !!process.env.GOOGLE_CLIENT_ID, domains: allowedDomains() });
    if (errors.length) return rerender(422);

    if (await Users.findByEmail(email)) { // same message either way would hide this; accept the small enumeration trade-off for usability but never reveal verification state
      errors.push('An account with this e-mail already exists. Try logging in.'); return rerender(409);
    }
    const hash = await bcrypt.hash(String(b.password), 12);
    const mailOn = !!process.env.SMTP_HOST;
    const token = crypto.randomBytes(32).toString('hex');
    const id = await Users.create({
      fullName: old.full_name.trim(), email, passwordHash: hash, verified: !mailOn, tokenHash: mailOn ? sha256(token) : null,
      userType: old.user_type, idNumber: old.id_number.trim() || null, departmentId: Number(old.department_id) || null
    });
    await logActivity(req, 'register', email, id);
    if (mailOn) {
      await sendMail(email, 'Confirm your CSPC EquiHub account',
        'Hello ' + old.full_name.trim() + ',\n\nConfirm your account (valid 24 hours):\n' + process.env.BASE_URL + '/verify/' + token + '\n\nIf you did not sign up, ignore this message.');
      req.session.flash = 'Account created. Check your CSPC e-mail for the confirmation link.';
    } else req.session.flash = 'Account created. You can log in now.';
    res.redirect(303, '/login');
  }));

router.get('/verify/:token([a-f0-9]{64})', h(async (req, res) => {
  const ok = await Users.verifyByToken(sha256(req.params.token));
  req.session.flash = ok ? 'E-mail confirmed. You can log in now.' : 'That confirmation link is invalid or expired.';
  res.redirect('/login');
}));

// ---------------- Google sign-in / sign-up ----------------
function googleClient() {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.BASE_URL + '/auth/google/callback');
}
router.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.redirect('/login');
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const hd = allowedDomains()[0];
  res.redirect(googleClient().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account', ...(allowedDomains().length === 1 ? { hd } : {}) }));
});

router.get('/auth/google/callback', h(async (req, res, next) => {
  const bad = (m) => { req.session.flash = m; return res.redirect('/login'); };
  const { code, state } = req.query;
  if (typeof code !== 'string' || typeof state !== 'string' || !req.session.oauthState || state !== req.session.oauthState) return bad('Google sign-in could not be verified. Please try again.');
  delete req.session.oauthState;
  const client = googleClient();
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  const email = String(p.email || '').toLowerCase();
  if (!p.email_verified) return bad('Your Google e-mail is not verified.');
  if (!domainOk(email)) return bad('Please sign in with your CSPC Google account.');

  let u = await Users.findByGoogleId(p.sub);
  if (!u) {
    u = await Users.findByEmail(email);
    if (u) await Users.linkGoogle(u.id, p.sub);
    else { const id = await Users.create({ fullName: String(p.name || email.split('@')[0]).slice(0, 120), email, googleId: p.sub, verified: true }); u = await Users.findById(id); await logActivity(req, 'register', 'google ' + email, id); req.session.welcome = true; }
  }
  if (u.role !== 'user') return bad('Admins must use the admin sign-in page.');
  const welcome = req.session.welcome;
  await logActivity(req, 'login', 'google', u.id);
  startSession(req, u, (err, returnTo) => {
    if (err) return next(err);
    if (welcome) { delete req.session.reopen; return res.redirect('/account/profile'); }
    res.redirect(safeReturn(returnTo, '/'));
  });
}));

// ---------------- logout (POST + CSRF) ----------------
router.post('/logout', h(async (req, res) => {
  const wasAdmin = req.session.user && req.session.user.role === 'admin';
  await logActivity(req, 'logout');
  req.session.destroy(() => { res.clearCookie('equihub.sid'); res.redirect(303, wasAdmin ? '/admin/login' : '/'); });
}));

module.exports = router;
