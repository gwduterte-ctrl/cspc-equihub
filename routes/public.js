const { Router } = require('express');
const Equip = require('../models/equipmentModel');
const Catalog = require('../models/catalogModel');
const { requireUser, safeReturn } = require('../middleware/auth');
const { collectErrors, verifyCsrf } = require('../middleware/security');
const Requests = require('../models/requestModel');
const { logActivity } = require('../utils/logger');
const { body, param } = require('express-validator');
const dates = require('../utils/dates');
const Settings = require('../models/settingsModel');

const router = Router();
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const int = (v, min = 1, max = 1e9) => { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const SORTS = ['name', 'newest', 'qty'];

function filters(req) {
  const sort = String(req.query.sort || 'name');
  return {
    q: String(req.query.q || '').trim().slice(0, 80),
    departmentId: int(req.query.department),
    categoryId: int(req.query.category),
    availableOnly: req.query.available === '1',
    sort: SORTS.includes(sort) ? sort : 'name',
    page: int(req.query.page, 1, 1000) || 1
  };
}
const isFiltered = (f) => !!(f.q || f.departmentId || f.categoryId || f.availableOnly);

async function filterData() {
  return { departments: await Catalog.listDepartments(), categories: await Catalog.listCategories() };
}

// department -> category -> items, in the order the rows were sorted
function groupDeptCat(rows, catImg) {
  const depts = new Map();
  rows.forEach((e) => {
    if (!depts.has(e.department_id)) depts.set(e.department_id, { id: e.department_id, code: e.dept_code, name: e.dept_name, logo: e.dept_logo, cats: new Map(), count: 0 });
    const d = depts.get(e.department_id); d.count++;
    if (!d.cats.has(e.category_id)) d.cats.set(e.category_id, { id: e.category_id, name: e.category_name, image: catImg[e.category_id], items: [] });
    d.cats.get(e.category_id).items.push(e);
  });
  return [...depts.values()].sort((x, y) => x.name.localeCompare(y.name))
    .map((d) => ({ ...d, cats: [...d.cats.values()].sort((x, y) => x.name.localeCompare(y.name)) }));
}
const imgMap = (cats) => Object.fromEntries(cats.map((c) => [c.id, c.image]));

// A pop-up always sits on top of a real page (home or equipments) that stays visible, blurred, behind it.
const takeReopen = (req) => { const r = req.session.reopen; delete req.session.reopen; return /^\/borrow\/\d+$/.test(r || '') ? r : null; };
const cameFromHome = (req) => { try { const u = new URL(req.get('referer') || ''); return u.host === req.get('host') && u.pathname === '/'; } catch (e) { return false; } };

async function renderHome(req, res, popup = null, code = 200) {
  const f = filters(req);
  const data = await filterData();
  const site = await Settings.getAll();
  let groups = [], results = null;
  if (isFiltered(f)) {
    results = await Equip.search({ ...f, perPage: 12 });
  } else {
    const all = await Equip.search({ sort: 'featured', perPage: 200 }); // featured items first, chosen by the admin
    const perDept = Math.min(8, Math.max(2, Number.parseInt(site.home_items, 10) || 4));
    groups = groupDeptCat(all.rows, imgMap(data.categories)).map((d) => ({ ...d, items: d.cats.flatMap((c) => c.items).sort((a, b) => b.featured - a.featured).slice(0, perDept) }));
  }
  res.status(code).render('public/home', { title: popup ? popup.e.name : 'Home', shell: 'public', site, f, ...data, groups, results, action: '/', popup, reopen: popup ? null : takeReopen(req) });
}

async function renderCatalog(req, res, popup = null, code = 200) {
  const f = filters(req);
  const data = await filterData();
  const all = await Equip.search({ ...f, page: 1, perPage: 120 });
  res.status(code).render('public/equipments', { title: popup ? popup.e.name : 'Equipments', shell: 'public', f, ...data, total: all.total, groups: groupDeptCat(all.rows, imgMap(data.categories)), action: '/equipments', popup, reopen: popup ? null : takeReopen(req) });
}

// direct visit / refresh of a pop-up URL: show the page the visitor came from, with the pop-up open on top
function renderBehind(req, res, popup, code = 200) {
  const home = cameFromHome(req);
  popup.closeUrl = home ? '/' : '/equipments';
  return (home ? renderHome : renderCatalog)(req, res, popup, code);
}

router.get('/', h((req, res) => renderHome(req, res)));
router.get('/equipments', h((req, res) => renderCatalog(req, res)));

router.get('/equipments/:id(\\d+)', h(async (req, res) => {
  res.vary('X-Modal');
  const e = await Equip.findById(req.params.id);
  if (req.get('x-modal')) { // pop-up version: only the card content
    if (!e) return res.status(404).end();
    res.set('Cache-Control', 'no-store');
    return res.render('partials/detail-body', { e, modal: true });
  }
  if (!e) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'That equipment does not exist.', shell: 'public' });
  return renderBehind(req, res, { type: 'detail', e });
}));

router.get('/privacy', (req, res) => res.render('public/privacy', { title: 'Privacy Notice', shell: 'public' }));
// the visitor ticked the box in the privacy / cookie pop-up
router.post('/consent', h(async (req, res) => {
  const back = safeReturn(req.body.back, '/');
  if (req.body.agree !== 'yes') { req.session.flash = 'Please tick the box to continue.'; return res.redirect(303, back); }
  res.cookie('hh_consent', '1', { maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  await logActivity(req, 'consent_accepted', 'privacy notice v1');
  if (req.get('x-fetch')) return res.json({ ok: true });
  res.redirect(303, back);
}));
router.get('/about', h(async (req, res) => {
  const [site, departments, categories, items] = await Promise.all([Settings.getAll(), Catalog.listDepartments(), Catalog.listCategories(), Equip.search({ perPage: 1 })]);
  res.render('public/about', { title: 'About', shell: 'public', site, stats: { items: items.total, departments: departments.length, categories: categories.length } });
}));

// ---- Borrow request form (login required)
const MAX_DAYS = 14;
// full page normally; just the card content when the page asks for a pop-up
function renderBorrow(req, res, data, code = 200) {
  res.vary('X-Modal');
  if (req.get('x-modal')) { res.set('Cache-Control', 'no-store'); return res.status(code).render('partials/borrow-body', { ...data, modal: true }); }
  return renderBehind(req, res, { type: 'borrow', ...data }, code);
}
async function loadBorrowContext(req) {
  const e = await Equip.findById(req.params.id);
  const outstanding = await Requests.outstandingFor(req.session.user.id);
  return { e, outstanding };
}

router.get('/borrow/:id(\\d+)', requireUser, h(async (req, res) => {
  const { e, outstanding } = await loadBorrowContext(req);
  if (!e) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'That equipment does not exist.', shell: 'public' });
  renderBorrow(req, res, { e, outstanding, errors: [], old: {}, today: dates.today(), maxDays: MAX_DAYS });
}));

router.post('/borrow/:id(\\d+)', requireUser,
  [
    body('quantity').trim().isInt({ min: 1, max: 50 }).withMessage('Enter a valid quantity.'),
    body('borrow_date').trim().custom(dates.isDate).withMessage('Choose a borrow date.'),
    body('return_date').trim().custom(dates.isDate).withMessage('Choose a return date.'),
    body('purpose').trim().isLength({ min: 5, max: 255 }).withMessage('Purpose is required (5-255 characters).')
  ],
  h(async (req, res) => {
    const { e, outstanding } = await loadBorrowContext(req);
    if (!e) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'That equipment does not exist.', shell: 'public' });
    const errors = collectErrors(req);
    const old = {
      quantity: String(req.body.quantity || '').slice(0, 3), borrow_date: String(req.body.borrow_date || '').slice(0, 10),
      return_date: String(req.body.return_date || '').slice(0, 10), purpose: String(req.body.purpose || '').slice(0, 255)
    };
    const u = req.session.user, today = dates.today();
    if (u.is_blocked) errors.push('Your account is blocked from borrowing. Please contact the equipment office.');
    if (outstanding) errors.push('Return your previous equipment (' + outstanding.reference_no + ') before borrowing again.');
    if (e.status !== 'available') errors.push('This equipment is currently ' + e.status + '.');
    if (!errors.length) {
      const qty = Number(old.quantity);
      if (qty > e.available_qty) errors.push('Only ' + e.available_qty + ' available.');
      if (old.borrow_date < today) errors.push('Borrow date cannot be in the past.');
      if (old.return_date < old.borrow_date) errors.push('Return date must be on or after the borrow date.');
      else if (dates.diffDays(old.borrow_date, old.return_date) > MAX_DAYS) errors.push('Maximum borrowing period is ' + MAX_DAYS + ' days.');
    }
    if (errors.length) {
      return renderBorrow(req, res, { e, outstanding, errors, old, today, maxDays: MAX_DAYS }, 422);
    }
    const { id: newId, reference } = await Requests.create({
      userId: u.id, equipmentId: e.id, quantity: Number(old.quantity),
      borrowDate: old.borrow_date, returnDate: old.return_date, purpose: old.purpose
    });
    await logActivity(req, 'borrow_request', reference + ' - ' + e.name + ' x' + old.quantity);
    await Requests.notifyAdmins('New borrow request ' + reference + ' from ' + u.full_name + ': ' + e.name + ' x' + old.quantity + '.', '/admin/requests/' + newId);
    req.session.flash = 'Request ' + reference + ' submitted. We will notify you once it is reviewed.';
    if (req.get('x-modal')) return res.json({ redirect: '/account/requests' });
    res.redirect(303, '/account/requests'); // Post/Redirect/Get
  }));

module.exports = router;
