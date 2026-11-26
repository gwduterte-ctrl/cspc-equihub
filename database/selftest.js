// npm run db:test  - runs every kind of database operation the app uses against YOUR MySQL,
// using the real model functions, then deletes the rows it created.
const { db } = require('../db');
const Catalog = require('../models/catalogModel');
const Equip = require('../models/equipmentModel');
const Users = require('../models/userModel');
const Requests = require('../models/requestModel');
const Misc = require('../models/miscModel');
const Settings = require('../models/settingsModel');

let failed = 0, passed = 0;
const must = (c, m) => { if (!c) throw new Error(m || 'unexpected result'); };
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok    ' + name); } catch (e) { failed++; console.log('  FAIL  ' + name + '  ->  ' + e.message); }
};

(async () => {
  const tag = Date.now().toString(36).toUpperCase(), ids = {};
  console.log('EquiHub database self-test (test rows are removed at the end)\n');

  await step('connect to MySQL', async () => { const [[r]] = await db.query('SELECT 1 AS ok'); must(r.ok === 1); });
  await step('all tables exist', async () => {
    const need = ['departments', 'categories', 'equipment', 'users', 'borrow_requests', 'notifications', 'activity_logs', 'site_settings'];
    const [rows] = await db.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
    const have = rows.map((r) => String(r.t).toLowerCase()), miss = need.filter((n) => !have.includes(n));
    must(!miss.length, 'missing tables: ' + miss.join(', ') + ' - run npm run db:init');
  });

  await step('departments: create, read, update', async () => {
    const code = 'T' + tag.slice(-6);
    ids.dept = await Catalog.createDepartment({ code, name: 'Self test ' + tag, logo: null }); must(ids.dept, 'no id returned');
    must((await Catalog.findDepartment(ids.dept)).code === code, 'read-back failed');
    must(await Catalog.updateDepartment(ids.dept, { code, name: 'Self test renamed', logo: null }), 'update touched no row');
    must((await Catalog.findDepartment(ids.dept)).name === 'Self test renamed', 'update not saved');
  });
  await step('categories: create, read, update, list', async () => {
    ids.cat = await Catalog.createCategory({ name: 'Cat ' + tag, departmentId: ids.dept, image: null }); must(ids.cat, 'no id returned');
    must((await Catalog.findCategory(ids.cat)).name === 'Cat ' + tag, 'read-back failed');
    must(await Catalog.updateCategory(ids.cat, { name: 'Cat renamed ' + tag, departmentId: ids.dept, image: null }), 'update touched no row');
    must((await Catalog.listCategories(ids.dept)).length === 1, 'list by department failed');
  });
  await step('equipment: create, read, update (quantity + featured), search', async () => {
    ids.eq = await Equip.create({ categoryId: ids.cat, name: 'Selftest item ' + tag, description: 'temp', image: null, total: 3, status: 'available', featured: true }); must(ids.eq, 'no id returned');
    let e = await Equip.findById(ids.eq); must(e.total_qty === 3 && e.available_qty === 3 && e.featured === 1, 'read-back mismatch');
    must(await Equip.update(ids.eq, { categoryId: ids.cat, name: 'Selftest item ' + tag, description: 'temp 2', image: null, status: 'available', featured: false, total: 5 }), 'update touched no row');
    e = await Equip.findById(ids.eq); must(e.total_qty === 5 && e.available_qty === 5 && e.featured === 0, 'quantity or featured not saved');
    const r = await Equip.search({ q: 'Selftest item ' + tag }); must(r.total === 1 && r.rows[0].dept_code, 'search failed');
  });
  await step('users: create, read, update, block / unblock, list', async () => {
    const email = 'selftest.' + tag.toLowerCase() + '@example.test';
    ids.user = await Users.createByAdmin({ fullName: 'Self Test', email, passwordHash: 'x', role: 'user', userType: 'student', idNumber: null, departmentId: null }); must(ids.user, 'no id returned');
    must((await Users.findByEmail(email)).id === ids.user, 'find by e-mail failed');
    await Users.updateByAdmin(ids.user, { fullName: 'Self Test 2', userType: 'faculty', idNumber: '1', departmentId: ids.dept, role: 'user', passwordHash: null });
    must((await Users.findById(ids.user)).full_name === 'Self Test 2', 'update not saved');
    must(await Users.setBlocked(ids.user, true, 'test'), 'block failed'); must((await Users.findById(ids.user)).is_blocked === 1, 'block not saved');
    must(await Users.setBlocked(ids.user, false, null), 'unblock failed');
    must((await Users.listForAdmin('Self Test 2', 'user')).length >= 1, 'admin list failed');
  });
  await step('requests: create, read, list, edit', async () => {
    const c = await Requests.create({ userId: ids.user, equipmentId: ids.eq, quantity: 1, borrowDate: '2030-01-01', returnDate: '2030-01-03', purpose: 'self test' });
    ids.req = c.id; ids.ref = c.reference; must(ids.req && ids.ref, 'no id returned');
    const r = await Requests.findById(ids.req); must(r.status === 'pending' && r.category_name && r.dept_code, 'read-back mismatch');
    must((await Requests.listForAdmin({ q: ids.ref })).length === 1, 'search by reference failed');
    must(await Requests.updateByAdmin(ids.req, { borrowDate: '2030-01-01', returnDate: '2030-01-05', purpose: 'self test 2', note: 'n', quantity: 1 }), 'edit touched no row');
  });
  await step('requests: approve reserves stock, proof, confirm return restores stock', async () => {
    must((await Requests.approve(ids.req, 'ok')).ok, 'approve failed'); must((await Equip.findById(ids.eq)).available_qty === 4, 'stock was not reserved');
    must((await Requests.outstandingFor(ids.user)), 'outstanding check failed');
    must(await Requests.submitProof(ids.req, ids.user, '0'.repeat(32) + '.jpg'), 'proof upload failed');
    must((await Requests.confirmReturn(ids.req)).ok, 'confirm return failed'); must((await Equip.findById(ids.eq)).available_qty === 5, 'stock was not restored');
    must((await Requests.outstandingFor(ids.user)) === undefined, 'user should be free to borrow again');
  });
  await step('notifications: list, delete one, clear all', async () => {
    const list = await Misc.listNotifications(ids.user); must(list.length >= 2, 'expected the approve + return notifications');
    await Misc.deleteNotification(ids.user, list[0].id); must((await Misc.listNotifications(ids.user)).length === list.length - 1, 'delete one failed');
    await Misc.clearNotifications(ids.user); must((await Misc.listNotifications(ids.user)).length === 0, 'clear failed');
    await Requests.notifyAdmins('selftest', null); // goes to admin accounts only
  });
  await step('requests: delete a finished request', async () => { must((await Requests.removeFinished(ids.req)).ok, 'delete failed'); });
  await step('homepage settings: save and restore', async () => {
    const before = (await Settings.getAll()).home_items;
    await Settings.setMany({ home_items: '6' }); must((await Settings.getAll()).home_items === '6', 'not saved');
    await Settings.setMany({ home_items: before });
  });
  await step('dashboard, calendar, overdue, logs and counts queries', async () => {
    await Requests.dashboardStats(); await Requests.listOverdue(); await Requests.recent(3); await Requests.alertCounts(); await Requests.statusCounts();
    await Requests.userSummary(ids.user); await Requests.dueByDay('2030-01-01', '2030-01-31'); await Equip.search({}); await Catalog.listDepartmentsAdmin();
    await Misc.allLogs('x'); await Misc.userLogs(ids.user); await Misc.clearOldLogs(36500);
  });

  // clean up everything this test created (deleting the user also removes their requests)
  await step('clean up test rows', async () => {
    if (ids.user) await Users.remove(ids.user); if (ids.eq) await Equip.remove(ids.eq);
    if (ids.cat) await Catalog.deleteCategory(ids.cat); if (ids.dept) await Catalog.deleteDepartment(ids.dept);
    const [[n]] = await db.query('SELECT COUNT(*) AS n FROM departments WHERE code = ?', ['T' + tag.slice(-6)]); must(n.n === 0, 'test department is still there');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Could not run the self-test:', e.message); process.exit(1); });
