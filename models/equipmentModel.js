const { db } = require('../db');

const STATUSES = ['available', 'maintenance', 'unavailable'];
const BASE = 'SELECT e.id, e.name, e.description, e.image, e.total_qty, e.available_qty, e.status, e.category_id, ' +
             'c.name AS category_name, c.department_id, d.code AS dept_code, d.name AS dept_name, d.logo AS dept_logo, e.featured ' +
             'FROM equipment e JOIN categories c ON c.id = e.category_id JOIN departments d ON d.id = c.department_id';

// Search + filters. Values are placeholders; ORDER BY is chosen from an allow-list.
async function search({ q = '', departmentId = null, categoryId = null, availableOnly = false, sort = 'name', page = 1, perPage = 12 }) {
  const where = []; const p = [];
  if (q) { where.push('(e.name LIKE ? OR e.description LIKE ?)'); const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%'; p.push(like, like); }
  if (departmentId) { where.push('c.department_id = ?'); p.push(departmentId); }
  if (categoryId) { where.push('e.category_id = ?'); p.push(categoryId); }
  if (availableOnly) where.push("e.status = 'available' AND e.available_qty > 0");
  const W = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const ORDER = { name: 'e.name ASC', newest: 'e.created_at DESC', qty: 'e.available_qty DESC', featured: 'e.featured DESC, e.name ASC' }[sort] || 'e.name ASC';
  const [[cnt]] = await db.query('SELECT COUNT(*) AS n FROM equipment e JOIN categories c ON c.id = e.category_id' + W, p);
  const [rows] = await db.query(BASE + W + ' ORDER BY ' + ORDER + ' LIMIT ? OFFSET ?', [...p, perPage, (page - 1) * perPage]);
  return { rows, total: cnt.n, pages: Math.max(1, Math.ceil(cnt.n / perPage)) };
}

const findById = async (id) => (await db.query(BASE + ' WHERE e.id = ?', [id]))[0][0];

async function create(d) {
  const [r] = await db.query(
    'INSERT INTO equipment (category_id, name, description, image, total_qty, available_qty, status, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [d.categoryId, d.name, d.description, d.image, d.total, d.total, d.status, d.featured ? 1 : 0]);
  return r.insertId;
}

// available_qty is shifted by the same amount as total_qty, never below 0 and never above total.
async function update(id, d) {
  const [r] = await db.query(
    'UPDATE equipment SET category_id = ?, name = ?, description = ?, image = COALESCE(?, image), status = ?, featured = ?, ' +
    'available_qty = LEAST(GREATEST(CAST(available_qty AS SIGNED) + (? - CAST(total_qty AS SIGNED)), 0), ?), total_qty = ? WHERE id = ?',
    [d.categoryId, d.name, d.description, d.image, d.status, d.featured ? 1 : 0, d.total, d.total, d.total, id]);
  return r.affectedRows === 1;
}
async function remove(id) { return (await db.query('DELETE FROM equipment WHERE id = ?', [id]))[0].affectedRows === 1; }

module.exports = { STATUSES, search, findById, create, update, remove };
