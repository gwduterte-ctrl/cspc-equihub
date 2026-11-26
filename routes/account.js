const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const path = require('path');
const { requireUser, safeReturn } = require('../middleware/auth');
const { collectErrors, verifyCsrf } = require('../middleware/security');
const Requests = require('../models/requestModel');
const Users = require('../models/userModel');
const Catalog = require('../models/catalogModel');
const Misc = require('../models/miscModel');
const { upload, saveImage, removeImage } = require('../utils/images');
const { PROOF_DIR, sendProof } = require('../utils/proofs');
const { logActivity } = require('../utils/logger');

const router = Router();
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const USER_TYPES = ['student', 'faculty', 'employee'];
router.use(requireUser);

router.get('/', (req, res) => res.redirect('/account/requests'));

// Notifications are shown inside the side menu on every account page (no page of their own).
router.use(h(async (req, res, next) => {
  res.locals.sideNotifs = (await Misc.listNotifications(req.session.user.id)).slice(0, 6);
  res.locals.sideSummary = await Requests.userSummary(req.session.user.id);
  next();
}));
router.get('/notifications', (req, res) => res.redirect('/account/requests#notifications'));
const notifBack = (req) => safeReturn(req.body.back, '/account/requests') + '#notifications';
router.post('/notifications/:id(\\d+)/delete', h(async (req, res) => {
  await Misc.deleteNotification(req.session.user.id, Number(req.params.id));
  if (req.get('x-fetch')) return res.json({ ok: true });
  res.redirect(303, notifBack(req));
}));
router.post('/notifications/clear', h(async (req, res) => {
  await Misc.clearNotifications(req.session.user.id);
  await logActivity(req, 'notifications_clear');
  req.session.flash = 'All notifications were cleared.';
  res.redirect(303, notifBack(req));
}));
router.post('/notifications/read', h(async (req, res) => {
  await Misc.markAllRead(req.session.user.id);
  if (req.get('x-fetch')) return res.json({ ok: true });
  res.redirect(303, '/account/requests#notifications');
}));

// ---- profile
async function profileView(req, res, extra = {}) {
  const u = await Users.findById(req.session.user.id);
  res.render('account/profile', { title: 'Profile', shell: 'account', section: 'profile', p: u, departments: await Catalog.listDepartments(), errors: [], pwErrors: [], hasPassword: !!u.password_hash, ...extra });
}
router.get('/profile', h((req, res) => profileView(req, res)));

router.post('/profile',
  [
    body('full_name').trim().isLength({ min: 2, max: 120 }).withMessage('Enter your full name.'),
    body('user_type').isIn(USER_TYPES).withMessage('Choose student, faculty or employee.'),
    body('id_number').trim().isLength({ max: 30 }).matches(/^[\w\- ]*$/).withMessage('ID number has invalid characters.'),
    body('department_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid department.')
  ],
  h(async (req, res) => {
    const errors = collectErrors(req);
    if (errors.length) return profileView(req, res, { errors });
    await Users.updateProfile(req.session.user.id, {
      fullName: req.body.full_name.trim(), userType: req.body.user_type,
      idNumber: String(req.body.id_number || '').trim() || null, departmentId: Number(req.body.department_id) || null
    });
    await logActivity(req, 'profile_update');
    req.session.flash = 'Profile updated.';
    res.redirect(303, '/account/profile');
  }));

router.post('/profile/password',
  [
    body('new_password').isLength({ min: 10, max: 128 }).withMessage('New password must be 10-128 characters.'),
    body('confirm').custom((v, { req }) => v === req.body.new_password).withMessage('Passwords do not match.')
  ],
  h(async (req, res) => {
    const pwErrors = collectErrors(req);
    const u = await Users.findById(req.session.user.id);
    if (!pwErrors.length && u.password_hash && !(await bcrypt.compare(String(req.body.current_password || ''), u.password_hash))) pwErrors.push('Current password is incorrect.');
    if (pwErrors.length) return profileView(req, res, { pwErrors });
    await Users.setPassword(u.id, await bcrypt.hash(String(req.body.new_password), 12));
    await logActivity(req, 'password_change');
    req.session.flash = 'Password saved.';
    res.redirect(303, '/account/profile');
  }));

// ---- request history
router.get('/requests', h(async (req, res) => {
  const status = Requests.STATUSES.includes(req.query.status) ? req.query.status : null;
  const items = await Requests.listForUser(req.session.user.id, status);
  res.render('account/requests', { title: 'Request history', shell: 'account', section: 'requests', items, status, statuses: Requests.STATUSES });
}));

async function ownRequest(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const r = Number.isInteger(id) ? await Requests.findForUser(id, req.session.user.id) : null; // ownership checked in SQL
  if (!r) res.status(404).render('error', { title: 'Not found', code: 404, message: 'Request not found.', shell: 'public' });
  return r;
}

router.get('/requests/:id(\\d+)', h(async (req, res) => {
  const r = await ownRequest(req, res); if (!r) return;
  res.render('account/request-detail', { title: r.reference_no, shell: 'account', section: 'requests', r, errors: [] });
}));

router.post('/requests/:id(\\d+)/cancel', h(async (req, res) => {
  const ok = await Requests.cancel(Number(req.params.id), req.session.user.id);
  if (ok) await logActivity(req, 'borrow_cancel', 'request #' + req.params.id);
  req.session.flash = ok ? 'Request cancelled.' : 'Only pending requests can be cancelled.';
  res.redirect(303, '/account/requests');
}));

router.post('/requests/:id(\\d+)/proof', upload.single('proof'), verifyCsrf, h(async (req, res) => {
  const r = await ownRequest(req, res); if (!r) return;
  const fail = (msg) => res.status(422).render('account/request-detail', { title: r.reference_no, shell: 'account', section: 'requests', r, errors: [msg] });
  if (!['approved', 'return_submitted'].includes(r.status)) return fail('This request is not waiting for a return.');
  if (!req.file) return fail('Attach a JPG, PNG or WebP photo (max 3 MB).');
  const name = saveImage(req.file, PROOF_DIR);
  if (!name) return fail('That file is not a valid image.');
  if (r.return_proof) removeImage(PROOF_DIR, r.return_proof);
  await Requests.submitProof(r.id, req.session.user.id, name);
  await Requests.notifyAdmins('Return proof uploaded for ' + r.reference_no + ' by ' + req.session.user.full_name + '.', '/admin/requests/' + r.id);
  await logActivity(req, 'return_proof', r.reference_no);
  req.session.flash = 'Return proof uploaded. An admin will verify it shortly.';
  res.redirect(303, '/account/requests/' + r.id);
}));

router.get('/files/proof/:id(\\d+)', h(async (req, res) => {
  const r = await ownRequest(req, res); if (!r) return;
  sendProof(res, r);
}));

router.get('/logs', h(async (req, res) => {
  res.render('account/logs', { title: 'Activity logs', shell: 'account', section: 'logs', items: await Misc.userLogs(req.session.user.id) });
}));

// ---- right to access / portability (RA 10173, Week 3)
router.get('/my-data.json', h(async (req, res) => {
  const u = await Users.findById(req.session.user.id);
  const profile = { full_name: u.full_name, email: u.email, user_type: u.user_type, id_number: u.id_number, created_at: u.created_at };
  res.set('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json({ profile, requests: await Requests.listForUser(u.id), logs: await Misc.userLogs(u.id) });
}));

module.exports = router;
