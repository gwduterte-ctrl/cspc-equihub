const { db } = require('../db');

const listDepartments = async () => (await db.query('SELECT id, code, name, logo FROM departments ORDER BY name'))[0];
const findDepartment = async (id) => (await db.query('SELECT id, code, name, logo FROM departments WHERE id = ?', [id]))[0][0];
const listDepartmentsAdmin = async () => (await db.query(
  'SELECT d.id, d.code, d.name, d.logo, (SELECT COUNT(*) FROM categories c WHERE c.department_id = d.id) AS categories, ' +
  '(SELECT COUNT(*) FROM equipment e JOIN categories c ON c.id = e.category_id WHERE c.department_id = d.id) AS items FROM departments d ORDER BY d.name'))[0];
const createDepartment = async ({ code, name, logo }) => (await db.query('INSERT INTO departments (code, name, logo) VALUES (?, ?, ?)', [code, name, logo]))[0].insertId;
const updateDepartment = async (id, { code, name, logo }) => (await db.query('UPDATE departments SET code = ?, name = ?, logo = COALESCE(?, logo) WHERE id = ?', [code, name, logo, id]))[0].affectedRows === 1;
const deleteDepartment = async (id) => (await db.query('DELETE FROM departments WHERE id = ?', [id]))[0].affectedRows === 1;

async function listCategories(departmentId = null) {
  let sql = 'SELECT c.id, c.name, c.image, c.department_id, d.code AS dept_code, d.name AS dept_name, ' +
            '(SELECT COUNT(*) FROM equipment e WHERE e.category_id = c.id) AS items ' +
            'FROM categories c JOIN departments d ON d.id = c.department_id';
  const p = [];
  if (departmentId) { sql += ' WHERE c.department_id = ?'; p.push(departmentId); }
  return (await db.query(sql + ' ORDER BY d.name, c.name', p))[0];
}
const findCategory = async (id) => (await db.query('SELECT id, name, image, department_id FROM categories WHERE id = ?', [id]))[0][0];

async function createCategory({ name, departmentId, image }) {
  const [r] = await db.query('INSERT INTO categories (department_id, name, image) VALUES (?, ?, ?)', [departmentId, name, image]);
  return r.insertId;
}
async function updateCategory(id, { name, departmentId, image }) {
  const [r] = await db.query('UPDATE categories SET name = ?, department_id = ?, image = COALESCE(?, image) WHERE id = ?',
    [name, departmentId, image, id]);
  return r.affectedRows === 1;
}
async function deleteCategory(id) {
  const [r] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
  return r.affectedRows === 1;
}
module.exports = { findDepartment, listDepartmentsAdmin, createDepartment, updateDepartment, deleteDepartment, listDepartments, listCategories, findCategory, createCategory, updateCategory, deleteCategory };
