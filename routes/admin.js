const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const { collectErrors, verifyCsrf } = require('../middleware/security');
const Users = require('../models/userModel');
const Catalog = require('../models/catalogModel');
const Equip = require('../models/equipmentModel');
const Requests = require('../models/requestModel');
const Misc = require('../models/miscModel');
const { upload, saveImage, removeImage } = require('../utils/images');
const { sendProof, PROOF_DIR } = require('../utils/proofs');
const { logActivity } = require('../utils/logger');
const { sendMail } = require('../utils/mailer');
const path = require('path');
const dates = require('../utils/dates');
const Settings = require('../models/settingsModel');
const { runOverdueReminders } = require('../utils/overdue');

const router = Router();
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const EQ_DIR = path.join(__dirname, '..', 'public', 'uploads', 'equipment');
const CAT_DIR = path.join(__dirname, '..', 'public', 'uploads', 'categories');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const int = (v) => { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('error', { title: 'Too many attempts', code: 429, message: 'Too many attempts. Try again later.', shell: 'public' }) });
const view = (res, file, section, data = {}) => res.render('admin/' + file, { shell: 'admin', section, errors: [], ...data });
const notFound = (res) => res.status(404).render('error', { title: 'Not found', code: 404, message: 'Not found.', shell: 'public' });

// ---------------- admin login (separate URL, separate form) ----------------
router.get('/login', (req, res) => {
  if (req.session.user && req.session.user.role === 'admin') return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin sign-in', shell: 'auth', errors: [], old: {} });
});
router.post('/login', adminLimiter, h(async (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 160);
  const u = await Users.findByEmail(email);
  const ok = await bcrypt.compare(String(req.body.password || '').slice(0, 200), (u && u.password_hash) || DUMMY_HASH);
  if (!u || !ok || u.role !== 'admin') {
    await logActivity(req, 'admin_login_failed', email);
    return res.status(401).render('admin/login', { title: 'Admin sign-in', shell: 'auth', errors: ['Incorrect e-mail or password.'], old: { email } });
  }
  req.session.regenerate(async (err) => {
    if (err) return next(err);
    req.session.userId = u.id;
    req.session.user = { id: u.id, role: 'admin' };
    req.session.greet = true;
    await logActivity(req, 'admin_login', null, u.id);
    res.redirect(303, '/admin');
  });
}));

router.use(requireAdmin); // everything below requires an admin session
// ---------------- notifications (admin bell) ----------------
router.get('/notifications', h(async (req, res) => {
  const items = await Misc.listNotifications(req.session.user.id);
  await Misc.markAllRead(req.session.user.id);
  view(res, 'notifications', 'notifications', { title: 'Notifications', items });
}));
router.post('/notifications/:id(\\d+)/delete', h(async (req, res) => {
  await Misc.deleteNotification(req.session.user.id, Number(req.params.id));
  res.redirect(303, '/admin/notifications');
}));
router.post('/notifications/clear', h(async (req, res) => {
  await Misc.clearNotifications(req.session.user.id);
  req.session.flash = 'All notifications were cleared.';
  res.redirect(303, '/admin/notifications');
}));

// ---------------- dashboard ----------------
// month grid (Mon-Sun) with the days that have returns due; past-due days are flagged
async function buildCalendar(y, m) {
  const t = dates.today(); const [ty, tm, today] = t.split('-').map(Number);
  if (!y || !m) { y = ty; m = tm; }
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  const due = Object.fromEntries((await Requests.dueByDay(`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(dim)}`)).map((r) => [Number(r.d), r]));
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const prevDim = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ d: prevDim - lead + 1 + i, out: true });
  for (let d = 1; d <= dim; d++) cells.push({ d, today: y === ty && m === tm && d === today, sun: (lead + d - 1) % 7 === 6, n: due[d] ? due[d].n : 0, late: due[d] ? Number(due[d].late) === 1 : false });
  for (let k = 1; cells.length % 7; k++) cells.push({ d: k, out: true });
  return { y, m, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), cells };
}

router.get('/', h(async (req, res) => {
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) % 24;
  view(res, 'dashboard', 'dashboard', {
    title: 'Dashboard', stats: await Requests.dashboardStats(), recent: await Requests.recent(5), calendar: await buildCalendar(),
    greeting: hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening', todayStr: dates.today()
  });
}));

router.get('/dashboard/calendar', h(async (req, res) => {
  const y = parseInt(req.query.y, 10), m = parseInt(req.query.m, 10);
  if (!y || !m || m < 1 || m > 12) return res.status(400).end();
  res.json(await buildCalendar(y, m));
}));

router.get('/dashboard/day', h(async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).end();
  const rows = await Requests.dueOnDay(date);
  res.json(rows.map((r) => ({ id: r.id, reference_no: r.reference_no, full_name: r.full_name, equipment_name: r.equipment_name, quantity: r.quantity, status: r.status, overdue: !!r.overdue })));
}));

// top-bar "Search anything": requests, equipment and users in one page
router.get('/search', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  let reqs = [], eq = [], us = [];
  if (q) {
    reqs = (await Requests.listForAdmin({ q })).slice(0, 8);
    eq = (await Equip.search({ q, perPage: 8 })).rows;
    us = (await Users.listForAdmin(q)).slice(0, 8);
  }
  view(res, 'search', 'search', { title: 'Search', q, reqs, eq, us });
}));

// ---------------- equipment ----------------
const equipRules = [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Equipment name is required (2-120 characters).'),
  body('description').trim().isLength({ max: 500 }).withMessage('Description is too long (max 500).'),
  body('category_id').isInt({ min: 1 }).withMessage('Choose a category.'),
  body('total_qty').isInt({ min: 0, max: 9999 }).withMessage('Total quantity must be 0-9999.'),
  body('status').isIn(Equip.STATUSES).withMessage('Choose a valid status.')
];
async function equipForm(res, e, errors = [], code = 200) {
  res.status(code).render('admin/equipment-form', { title: e.id ? 'Edit equipment' : 'Add equipment', shell: 'admin', section: 'equipment', e, errors, categories: await Catalog.listCategories(), statuses: Equip.STATUSES });
}

router.get('/equipment', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const page = int(req.query.page) || 1;
  const results = await Equip.search({ q, categoryId: int(req.query.category), page, perPage: 15 });
  view(res, 'equipment', 'equipment', { title: 'Equipment', results, q, categories: await Catalog.listCategories(), categoryId: int(req.query.category), f: { q, categoryId: int(req.query.category), page }, action: '/admin/equipment' });
}));
router.get('/equipment/new', h((req, res) => equipForm(res, { name: '', description: '', category_id: int(req.query.category) || '', total_qty: 1, status: 'available', featured: false })));

async function readEquip(req) {
  const b = req.body;
  return { id: null, name: String(b.name || '').trim(), description: String(b.description || '').trim(), category_id: Number(b.category_id) || '', total_qty: b.total_qty, status: b.status, featured: b.featured === '1' };
}
router.post('/equipment', upload.single('image'), verifyCsrf, equipRules, h(async (req, res) => {
  const e = await readEquip(req);
  const errors = collectErrors(req);
  if (!errors.length && !(await Catalog.findCategory(e.category_id))) errors.push('Choose a valid category.');
  let image = null;
  if (req.file) { image = saveImage(req.file, EQ_DIR); if (!image) errors.push('Image must be a real JPG, PNG or WebP file.'); }
  if (errors.length) { removeImage(EQ_DIR, image); return equipForm(res, e, errors, 422); }
  const id = await Equip.create({ categoryId: e.category_id, name: e.name, description: e.description, image, total: Number(e.total_qty), status: e.status, featured: e.featured });
  await logActivity(req, 'equipment_add', e.name + ' (#' + id + ')');
  req.session.flash = 'Equipment added.';
  res.redirect(303, '/admin/equipment');
}));

router.get('/equipment/:id(\\d+)/edit', h(async (req, res) => {
  const e = await Equip.findById(req.params.id); if (!e) return notFound(res);
  equipForm(res, e);
}));
router.post('/equipment/:id(\\d+)', upload.single('image'), verifyCsrf, equipRules, h(async (req, res) => {
  const old = await Equip.findById(req.params.id); if (!old) return notFound(res);
  const e = { ...(await readEquip(req)), id: old.id, image: old.image };
  const errors = collectErrors(req);
  if (!errors.length && !(await Catalog.findCategory(e.category_id))) errors.push('Choose a valid category.');
  let image = null;
  if (req.file) { image = saveImage(req.file, EQ_DIR); if (!image) errors.push('Image must be a real JPG, PNG or WebP file.'); }
  if (errors.length) { removeImage(EQ_DIR, image); return equipForm(res, e, errors, 422); }
  await Equip.update(old.id, { categoryId: e.category_id, name: e.name, description: e.description, image, status: e.status, featured: e.featured, total: Number(e.total_qty) });
  if (image) removeImage(EQ_DIR, old.image);
  await logActivity(req, 'equipment_edit', e.name + ' (#' + old.id + ')');
  req.session.flash = 'Equipment updated.';
  res.redirect(303, '/admin/equipment');
}));
router.post('/equipment/:id(\\d+)/delete', h(async (req, res) => {
  const old = await Equip.findById(req.params.id); if (!old) return notFound(res);
  await Equip.remove(old.id); removeImage(EQ_DIR, old.image);
  await logActivity(req, 'equipment_delete', old.name + ' (#' + old.id + ')');
  req.session.flash = 'Equipment deleted.';
  res.redirect(303, '/admin/equipment');
}));

// ---------------- categories (per department) ----------------
const catRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Category name is required (2-80 characters).'),
  body('department_id').isInt({ min: 1 }).withMessage('Choose a department.')
];
async function catForm(res, c, errors = [], code = 200) {
  res.status(code).render('admin/category-form', { title: c.id ? 'Edit category' : 'Add category', shell: 'admin', section: 'categories', c, errors, departments: await Catalog.listDepartments() });
}
router.get('/categories', h(async (req, res) => view(res, 'categories', 'categories', { title: 'Categories', categories: await Catalog.listCategories() })));
router.get('/categories/new', h((req, res) => catForm(res, { name: '', department_id: '' })));

async function saveCategory(req, res, existing) {
  const c = { id: existing ? existing.id : null, name: String(req.body.name || '').trim(), department_id: Number(req.body.department_id) || '', image: existing ? existing.image : null };
  const errors = collectErrors(req);
  if (!errors.length && !(await Catalog.listDepartments()).some((d) => d.id === c.department_id)) errors.push('Choose a valid department.');
  let image = null;
  if (req.file) { image = saveImage(req.file, CAT_DIR); if (!image) errors.push('Image must be a real JPG, PNG or WebP file.'); }
  if (errors.length) { removeImage(CAT_DIR, image); return catForm(res, c, errors, 422); }
  try {
    if (existing) { await Catalog.updateCategory(existing.id, { name: c.name, departmentId: c.department_id, image }); if (image) removeImage(CAT_DIR, existing.image); }
    else await Catalog.createCategory({ name: c.name, departmentId: c.department_id, image });
  } catch (e) {
    removeImage(CAT_DIR, image);
    if (e.code === 'ER_DUP_ENTRY') return catForm(res, c, ['That category already exists in this department.'], 409);
    throw e;
  }
  await logActivity(req, existing ? 'category_edit' : 'category_add', c.name);
  req.session.flash = 'Category saved.';
  res.redirect(303, '/admin/categories');
}
router.post('/categories', upload.single('image'), verifyCsrf, catRules, h((req, res) => saveCategory(req, res, null)));
router.get('/categories/:id(\\d+)/edit', h(async (req, res) => { const c = await Catalog.findCategory(req.params.id); if (!c) return notFound(res); catForm(res, c); }));
router.post('/categories/:id(\\d+)', upload.single('image'), verifyCsrf, catRules, h(async (req, res) => { const c = await Catalog.findCategory(req.params.id); if (!c) return notFound(res); saveCategory(req, res, c); }));
router.post('/categories/:id(\\d+)/delete', h(async (req, res) => {
  const c = await Catalog.findCategory(req.params.id); if (!c) return notFound(res);
  await Catalog.deleteCategory(c.id); removeImage(CAT_DIR, c.image);
  await logActivity(req, 'category_delete', c.name);
  req.session.flash = 'Category deleted along with its equipment.';
  res.redirect(303, '/admin/categories');
}));

// ---------------- borrow requests ----------------
// The request pop-up always sits on top of the list (blurred): clicked row, direct link, refresh or a link from a notification.
async function renderRequests(req, res, popup = null) {
  const status = [...Requests.STATUSES, 'overdue'].includes(req.query.status) ? req.query.status : null;
  const q = String(req.query.q || '').trim().slice(0, 80);
  view(res, 'requests', 'requests', { title: popup ? popup.r.reference_no : 'Requests', items: await Requests.listForAdmin({ status, q }), status, q, counts: await Requests.statusCounts(), popup });
}
router.get('/requests', h((req, res) => renderRequests(req, res)));

// ---- create / edit / delete requests (walk-ins, extensions, clean-up)
const reqRules = [
  body('borrow_date').trim().custom(dates.isDate).withMessage('Choose a borrow date.'),
  body('return_date').trim().custom(dates.isDate).withMessage('Choose a return date.'),
  body('purpose').trim().isLength({ min: 5, max: 255 }).withMessage('Purpose is required (5-255 characters).')
];
function checkDates(b, errors, notPast) {
  if (errors.length) return;
  if (notPast && b.borrow_date < dates.today()) errors.push('Borrow date cannot be in the past.');
  if (b.return_date < b.borrow_date) errors.push('Return date must be on or after the borrow date.');
  else if (dates.diffDays(b.borrow_date, b.return_date) > 30) errors.push('Maximum borrowing period is 30 days.');
}
const oldReq = (b) => ({ user_email: String(b.user_email || '').slice(0, 160), equipment_id: String(b.equipment_id || ''), quantity: String(b.quantity || '').slice(0, 3),
  borrow_date: String(b.borrow_date || '').slice(0, 10), return_date: String(b.return_date || '').slice(0, 10), purpose: String(b.purpose || '').slice(0, 255), note: String(b.note || '').slice(0, 255), approve: b.approve === '1' });
async function requestForm(res, { mode, r = null, old = {}, errors = [], code = 200 }) {
  const equipment = mode === 'new' ? (await Equip.search({ availableOnly: true, perPage: 200 })).rows : [];
  res.status(code).render('admin/request-form', { title: mode === 'new' ? 'New request' : 'Edit request', shell: 'admin', section: 'requests', mode, r, old, errors, equipment, today: dates.today() });
}
router.get('/requests/new', h((req, res) => requestForm(res, { mode: 'new', old: { quantity: '1', borrow_date: dates.today() } })));
router.post('/requests', [
  body('user_email').trim().isEmail().withMessage("Enter the borrower's e-mail."),
  body('equipment_id').isInt({ min: 1 }).withMessage('Choose equipment.'),
  body('quantity').trim().isInt({ min: 1, max: 50 }).withMessage('Enter a valid quantity.'), ...reqRules
], h(async (req, res) => {
  const b = req.body, old = oldReq(b), errors = collectErrors(req);
  checkDates(old, errors, true);
  let user = null, e = null;
  if (!errors.length) {
    user = await Users.findByEmail(old.user_email.trim().toLowerCase());
    if (!user || user.role !== 'user') errors.push('No borrower account with that e-mail.');
    else {
      if (user.is_blocked) errors.push('This user is blocked from borrowing.');
      if (await Requests.outstandingFor(user.id)) errors.push('This user still has unreturned equipment.');
    }
    e = await Equip.findById(Number(old.equipment_id));
    if (!e) errors.push('Choose equipment.');
    else { if (e.status !== 'available') errors.push('This equipment is ' + e.status + '.'); if (Number(old.quantity) > e.available_qty) errors.push('Only ' + e.available_qty + ' available.'); }
  }
  if (errors.length) return requestForm(res, { mode: 'new', old, errors, code: 422 });
  const { id, reference } = await Requests.create({ userId: user.id, equipmentId: e.id, quantity: Number(old.quantity), borrowDate: old.borrow_date, returnDate: old.return_date, purpose: old.purpose });
  let msg = 'Request ' + reference + ' created.';
  if (old.approve) { const out = await Requests.approve(id, 'Created by the equipment office'); msg = out.ok ? 'Request ' + reference + ' created and approved.' : msg + ' It could not be approved: ' + out.msg; }
  await logActivity(req, 'request_create', reference + ' for ' + user.email);
  req.session.flash = msg;
  res.redirect(303, '/admin/requests/' + id);
}));
router.get('/requests/:id(\\d+)/edit', h(async (req, res) => {
  const r = await Requests.findById(req.params.id); if (!r) return notFound(res);
  if (!['pending', 'approved'].includes(r.status)) { req.session.flash = 'Only pending or approved requests can be edited.'; return res.redirect(303, '/admin/requests/' + r.id); }
  requestForm(res, { mode: 'edit', r, old: { quantity: String(r.quantity), borrow_date: r.borrow_date, return_date: r.return_date, purpose: r.purpose, note: r.admin_note || '' } });
}));
router.post('/requests/:id(\\d+)/edit', [body('quantity').optional().trim().isInt({ min: 1, max: 50 }).withMessage('Enter a valid quantity.'),
  body('note').optional().trim().isLength({ max: 255 }).withMessage('Note is too long (max 255).'), ...reqRules], h(async (req, res) => {
  const r = await Requests.findById(req.params.id); if (!r) return notFound(res);
  if (!['pending', 'approved'].includes(r.status)) { req.session.flash = 'Only pending or approved requests can be edited.'; return res.redirect(303, '/admin/requests/' + r.id); }
  const old = oldReq(req.body), errors = collectErrors(req);
  checkDates(old, errors, false);
  if (!errors.length && r.status === 'pending') { const e = await Equip.findById(r.equipment_id); if (e && Number(old.quantity) > e.available_qty) errors.push('Only ' + e.available_qty + ' available.'); }
  if (errors.length) return requestForm(res, { mode: 'edit', r, old, errors, code: 422 });
  await Requests.updateByAdmin(r.id, { borrowDate: old.borrow_date, returnDate: old.return_date, purpose: old.purpose, note: old.note.trim() || null, quantity: Number(old.quantity) || r.quantity });
  await logActivity(req, 'request_edit', r.reference_no);
  req.session.flash = 'Request ' + r.reference_no + ' updated.';
  res.redirect(303, '/admin/requests/' + r.id);
}));
router.post('/requests/:id(\\d+)/delete', h(async (req, res) => {
  const r = await Requests.findById(req.params.id); if (!r) return notFound(res);
  const out = await Requests.removeFinished(r.id);
  if (!out.ok) { req.session.flash = 'Only returned, declined or cancelled requests can be deleted.'; return res.redirect(303, '/admin/requests/' + r.id); }
  removeImage(PROOF_DIR, out.proof);
  await logActivity(req, 'request_delete', r.reference_no);
  req.session.flash = 'Request ' + r.reference_no + ' deleted.';
  res.redirect(303, '/admin/requests');
}));
router.get('/requests/:id(\\d+)', h(async (req, res) => {
  res.vary('X-Modal');
  const r = await Requests.findById(req.params.id); if (!r) return notFound(res);
  if (req.get('x-modal')) { res.set('Cache-Control', 'no-store'); return res.render('partials/admin-request-body', { r, modal: true }); }
  return renderRequests(req, res, { r, closeUrl: '/admin/requests' });
}));
router.get('/files/proof/:id(\\d+)', h(async (req, res) => sendProof(res, await Requests.findById(req.params.id))));

const noteRule = body('note').optional().trim().isLength({ max: 255 }).withMessage('Note is too long (max 255).');
function decision(action, okMsg, mailSubject, logName) {
  return [noteRule, h(async (req, res) => {
    const id = Number(req.params.id);
    if (collectErrors(req).length) { req.session.flash = 'Note is too long.'; return res.redirect(303, req.body.back === 'list' ? '/admin/requests' : '/admin/requests/' + id); }
    const note = String(req.body.note || '').trim() || null;
    const out = await Requests[action](id, note);
    req.session.flash = out.ok ? okMsg : out.msg;
    if (out.ok) {
      await logActivity(req, logName, out.reference);
      const r = await Requests.findById(id);
      if (r) sendMail(r.email, mailSubject + ' - ' + out.reference, 'Hello ' + r.full_name + ',\n\n' + okMsg + (note ? '\nNote from admin: ' + note : '') + '\n\nOpen EquiHub: ' + process.env.BASE_URL + '/account/requests/' + id);
    }
    res.redirect(303, req.body.back === 'list' ? '/admin/requests' : '/admin/requests/' + id);
  })];
}
router.post('/requests/:id(\\d+)/approve', ...decision('approve', 'Request approved and stock reserved.', 'Borrow request approved', 'request_approve'));
router.post('/requests/:id(\\d+)/reject', ...decision('reject', 'Request declined.', 'Borrow request declined', 'request_reject'));
router.post('/requests/:id(\\d+)/confirm-return', ...decision('confirmReturn', 'Return confirmed. Stock restored and the user may borrow again.', 'Return confirmed', 'return_confirm'));
router.post('/requests/:id(\\d+)/reject-proof', ...decision('rejectProof', 'Return proof rejected; the user was asked to upload again.', 'Return proof not accepted', 'return_proof_reject'));

// ---------------- users (block / unblock) ----------------
router.get('/users', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const role = req.query.role === 'admin' ? 'admin' : 'user';
  view(res, 'users', 'users', { title: 'Users', users: await Users.listForAdmin(q, role), q, role });
}));
router.post('/users/:id(\\d+)/block', body('reason').trim().isLength({ min: 3, max: 255 }).withMessage('Give a reason (3-255 characters).'), h(async (req, res) => {
  const errors = collectErrors(req);
  if (errors.length) { req.session.flash = errors[0]; return res.redirect(303, '/admin/users'); }
  const ok = await Users.setBlocked(Number(req.params.id), true, req.body.reason.trim());
  if (ok) {
    await Requests.notify(Number(req.params.id), 'Your borrowing privilege was suspended: ' + req.body.reason.trim());
    await logActivity(req, 'user_block', 'user #' + req.params.id);
  }
  req.session.flash = ok ? 'User blocked from borrowing.' : 'User not found.';
  res.redirect(303, '/admin/users');
}));
router.post('/users/:id(\\d+)/unblock', h(async (req, res) => {
  const ok = await Users.setBlocked(Number(req.params.id), false, null);
  if (ok) { await Requests.notify(Number(req.params.id), 'Your borrowing privilege was restored.'); await logActivity(req, 'user_unblock', 'user #' + req.params.id); }
  req.session.flash = ok ? 'User unblocked.' : 'User not found.';
  res.redirect(303, '/admin/users');
}));

// ---------------- user detail ----------------
router.get('/users/:id(\\d+)', h(async (req, res) => {
  const found = await Users.findById(Number(req.params.id));
  if (!found || found.role !== 'user') return notFound(res);
  const { password_hash, ...u } = found; // never pass the hash to a view
  const reqs = await Requests.listForUser(u.id);
  view(res, 'user-detail', 'users', { title: u.full_name, u, reqs, logs: (await Misc.userLogs(u.id)).slice(0, 8) });
}));

// ---- create / edit / delete accounts (users and admins)
const USER_TYPES = ['student', 'faculty', 'employee'];
const userRules = (needPassword) => [
  body('full_name').trim().isLength({ min: 2, max: 120 }).withMessage('Enter the full name (2-120 characters).'),
  body('user_type').isIn(USER_TYPES).withMessage('Choose student, faculty or employee.'),
  body('role').isIn(['user', 'admin']).withMessage('Choose a role.'),
  body('id_number').trim().isLength({ max: 30 }).matches(/^[\w\- ]*$/).withMessage('ID number has invalid characters.'),
  body('department_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid department.'),
  needPassword ? body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be 10-128 characters.')
    : body('password').optional({ values: 'falsy' }).isLength({ min: 10, max: 128 }).withMessage('New password must be 10-128 characters.')
];
async function userForm(req, res, { u, old = {}, errors = [], code = 200 }) {
  res.status(code).render('admin/user-form', { title: u ? 'Edit account' : 'Add account', shell: 'admin', section: 'users', u, old, errors, departments: await Catalog.listDepartments(), self: !!u && u.id === req.session.user.id });
}
const oldUser = (b) => ({ full_name: String(b.full_name || '').slice(0, 120), email: String(b.email || '').slice(0, 160), user_type: String(b.user_type || ''), role: b.role === 'admin' ? 'admin' : 'user', id_number: String(b.id_number || '').slice(0, 30), department_id: String(b.department_id || '') });
router.get('/users/new', h((req, res) => userForm(req, res, { old: { role: req.query.role === 'admin' ? 'admin' : 'user', user_type: 'student' } })));
router.post('/users', [body('email').trim().isEmail().isLength({ max: 160 }).withMessage('Enter a valid e-mail.'), ...userRules(true)], h(async (req, res) => {
  const old = oldUser(req.body), errors = collectErrors(req), email = old.email.trim().toLowerCase();
  if (!errors.length && await Users.findByEmail(email)) errors.push('That e-mail is already registered.');
  if (errors.length) return userForm(req, res, { old, errors, code: 422 });
  const id = await Users.createByAdmin({ fullName: old.full_name.trim(), email, passwordHash: await bcrypt.hash(String(req.body.password), 12), role: old.role, userType: old.user_type, idNumber: old.id_number.trim() || null, departmentId: Number(old.department_id) || null });
  await logActivity(req, 'account_create', email + ' (' + old.role + ') #' + id);
  req.session.flash = 'Account created for ' + old.full_name.trim() + '.';
  res.redirect(303, '/admin/users' + (old.role === 'admin' ? '?role=admin' : ''));
}));
router.get('/users/:id(\\d+)/edit', h(async (req, res) => {
  const u = await Users.findById(Number(req.params.id)); if (!u) return notFound(res);
  userForm(req, res, { u, old: { full_name: u.full_name, email: u.email, user_type: u.user_type, role: u.role, id_number: u.id_number || '', department_id: String(u.department_id || '') } });
}));
router.post('/users/:id(\\d+)/edit', userRules(false), h(async (req, res) => {
  const u = await Users.findById(Number(req.params.id)); if (!u) return notFound(res);
  const old = { ...oldUser(req.body), email: u.email }, errors = collectErrors(req);
  const self = u.id === req.session.user.id;
  if (errors.length) return userForm(req, res, { u, old, errors, code: 422 });
  await Users.updateByAdmin(u.id, { fullName: old.full_name.trim(), userType: old.user_type, idNumber: old.id_number.trim() || null, departmentId: Number(old.department_id) || null,
    role: self ? u.role : old.role, passwordHash: req.body.password ? await bcrypt.hash(String(req.body.password), 12) : null });
  await logActivity(req, 'account_edit', u.email);
  req.session.flash = 'Account updated for ' + old.full_name.trim() + '.';
  res.redirect(303, '/admin/users' + ((self ? u.role : old.role) === 'admin' ? '?role=admin' : ''));
}));
router.post('/users/:id(\\d+)/delete', h(async (req, res) => {
  const u = await Users.findById(Number(req.params.id)); if (!u) return notFound(res);
  const back = '/admin/users' + (u.role === 'admin' ? '?role=admin' : '');
  if (u.id === req.session.user.id) { req.session.flash = 'You cannot delete your own account.'; return res.redirect(303, back); }
  if (await Requests.outstandingFor(u.id)) { req.session.flash = 'This user still has unreturned equipment, so the account cannot be deleted.'; return res.redirect(303, back); }
  await Users.remove(u.id);
  await logActivity(req, 'account_delete', u.email);
  req.session.flash = 'Account deleted: ' + u.full_name + '.';
  res.redirect(303, back);
}));

// ---------------- departments ----------------
const DEPT_DIR = path.join(__dirname, '..', 'public', 'uploads', 'departments');
const deptRules = [
  body('code').customSanitizer((v) => String(v || '').trim().toUpperCase()).matches(/^[A-Z0-9]{2,10}$/).withMessage('Code must be 2-10 letters or numbers (e.g. CCS).'),
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Department name is required (2-120 characters).')
];
async function deptForm(res, d, errors = [], code = 200) {
  res.status(code).render('admin/department-form', { title: d.id ? 'Edit department' : 'Add department', shell: 'admin', section: 'departments', d, errors });
}
router.get('/departments', h(async (req, res) => view(res, 'departments', 'departments', { title: 'Departments', departments: await Catalog.listDepartmentsAdmin() })));
router.get('/departments/new', h((req, res) => deptForm(res, { code: '', name: '', logo: null })));
async function saveDepartment(req, res, existing) {
  const d = { id: existing ? existing.id : null, code: String(req.body.code || '').trim().toUpperCase().slice(0, 10), name: String(req.body.name || '').trim(), logo: existing ? existing.logo : null };
  const errors = collectErrors(req);
  let logo = null;
  if (req.file) { logo = saveImage(req.file, DEPT_DIR); if (!logo) errors.push('Logo must be a real JPG, PNG or WebP file.'); }
  if (errors.length) { removeImage(DEPT_DIR, logo); return deptForm(res, d, errors, 422); }
  try {
    if (existing) { await Catalog.updateDepartment(existing.id, { code: d.code, name: d.name, logo }); if (logo) removeImage(DEPT_DIR, existing.logo); }
    else await Catalog.createDepartment({ code: d.code, name: d.name, logo });
  } catch (e) {
    removeImage(DEPT_DIR, logo);
    if (e.code === 'ER_DUP_ENTRY') return deptForm(res, d, ['That department code already exists.'], 409);
    throw e;
  }
  await logActivity(req, existing ? 'department_edit' : 'department_add', d.code);
  req.session.flash = 'Department saved.';
  res.redirect(303, '/admin/departments');
}
router.post('/departments', upload.single('logo'), verifyCsrf, deptRules, h((req, res) => saveDepartment(req, res, null)));
router.get('/departments/:id(\\d+)/edit', h(async (req, res) => { const d = await Catalog.findDepartment(req.params.id); if (!d) return notFound(res); deptForm(res, d); }));
router.post('/departments/:id(\\d+)', upload.single('logo'), verifyCsrf, deptRules, h(async (req, res) => { const d = await Catalog.findDepartment(req.params.id); if (!d) return notFound(res); saveDepartment(req, res, d); }));
router.post('/departments/:id(\\d+)/delete', h(async (req, res) => {
  const d = await Catalog.findDepartment(req.params.id); if (!d) return notFound(res);
  const row = (await Catalog.listDepartmentsAdmin()).find((x) => x.id === d.id);
  if (row && row.categories > 0) { req.session.flash = 'Remove or move this department\'s categories first.'; return res.redirect(303, '/admin/departments'); }
  await Catalog.deleteDepartment(d.id); removeImage(DEPT_DIR, d.logo);
  await logActivity(req, 'department_delete', d.code);
  req.session.flash = 'Department deleted.';
  res.redirect(303, '/admin/departments');
}));

// ---------------- overdue returns + reminders ----------------
router.get('/overdue', h(async (req, res) => view(res, 'overdue', 'overdue', { title: 'Overdue returns', items: await Requests.listOverdue() })));
router.post('/overdue/run', h(async (req, res) => {
  const n = await runOverdueReminders();
  await logActivity(req, 'overdue_reminders', n + ' sent');
  req.session.flash = n ? n + ' reminder' + (n === 1 ? '' : 's') + ' sent (side-menu notification and e-mail).' : 'Nothing new to send - everyone overdue was already reminded today.';
  res.redirect(303, '/admin/overdue');
}));
router.post('/requests/:id(\\d+)/remind', h(async (req, res) => {
  const id = Number(req.params.id);
  const r = await Requests.findById(id);
  const back = req.body.back === 'overdue' ? '/admin/overdue' : req.body.back === 'list' ? '/admin/requests' : '/admin/requests/' + id;
  if (!r || !r.overdue) { req.session.flash = 'Only overdue requests can be reminded.'; return res.redirect(303, back); }
  await runOverdueReminders({ id, force: true });
  await logActivity(req, 'overdue_reminder', r.reference_no);
  req.session.flash = 'Reminder sent to ' + r.full_name + ' (notification and e-mail).';
  res.redirect(303, back);
}));

// ---------------- homepage content ----------------
const settingRules = Settings.FIELDS.map((f) => f.number
  ? body(f.key).trim().isInt({ min: 2, max: 8 }).withMessage(f.label + ' must be a number from 2 to 8.')
  : body(f.key).trim().isLength({ min: 1, max: f.max }).withMessage(f.label + ' is required (max ' + f.max + ' characters).'));
router.get('/homepage', h(async (req, res) => view(res, 'homepage', 'homepage', { title: 'Homepage content', fields: Settings.FIELDS, values: await Settings.getAll() })));
router.post('/homepage', settingRules, h(async (req, res) => {
  const values = {};
  Settings.FIELDS.forEach((f) => { values[f.key] = String(req.body[f.key] == null ? '' : req.body[f.key]).trim().slice(0, f.number ? 1 : f.max); });
  const errors = collectErrors(req);
  if (errors.length) return res.status(422).render('admin/homepage', { title: 'Homepage content', shell: 'admin', section: 'homepage', errors, fields: Settings.FIELDS, values });
  await Settings.setMany(values);
  await logActivity(req, 'homepage_edit');
  req.session.flash = 'Homepage content saved.';
  res.redirect(303, '/admin/homepage');
}));
router.post('/homepage/reset', h(async (req, res) => {
  await Settings.reset(); await logActivity(req, 'homepage_reset');
  req.session.flash = 'Homepage content restored to the defaults.';
  res.redirect(303, '/admin/homepage');
}));

// ---------------- logs ----------------
router.post('/logs/clear', h(async (req, res) => {
  const n = await Misc.clearOldLogs(90);
  await logActivity(req, 'logs_clear', n + ' entries older than 90 days');
  req.session.flash = n ? n + ' old log entr' + (n === 1 ? 'y' : 'ies') + ' deleted.' : 'Nothing new to delete - no log entries are older than 90 days.';
  res.redirect(303, '/admin/logs');
}));
router.get('/logs', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  view(res, 'logs', 'logs', { title: 'Activity logs', items: await Misc.allLogs(q), q });
}));

module.exports = router;
