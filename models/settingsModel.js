// Homepage content the admin can edit. Only keys listed here can ever be stored (whitelist).
const { db } = require('../db');

const FIELDS = [
  { key: 'hero_eyebrow', label: 'Hero small heading', max: 60, def: 'CSPC \u00b7 EquiHub' },
  { key: 'hero_title', label: 'Hero title (white part)', max: 60, def: 'Your Campus Equipment' },
  { key: 'hero_accent', label: 'Hero title (blue part)', max: 60, def: 'In One Request' },
  { key: 'hero_lead', label: 'Hero paragraph', max: 240, def: 'Borrow projectors, tools and lab gear from every CSPC department. Pick an item, send one form, and track it all from your account.', long: true },
  { key: 'hero_script', label: 'Hero handwritten tagline (words separated by periods)', max: 60, def: 'Borrow. Use. Return. Repeat.' },
  { key: 'how_title', label: 'How it works title (dark part)', max: 60, def: 'Borrowing in' },
  { key: 'how_accent', label: 'How it works title (blue part)', max: 60, def: 'four easy steps' },
  { key: 'how_lead', label: 'How it works paragraph', max: 240, def: 'From sign-in to return, everything happens on EquiHub. Follow the steps on the right, then head to the catalog.', long: true },
  { key: 'step1_title', label: 'Step 1 title', max: 40, def: '1. Sign in' },
  { key: 'step1_text', label: 'Step 1 text', max: 160, def: 'Log in with your CSPC Google account, or create an account with your CSPC e-mail.', long: true },
  { key: 'step2_title', label: 'Step 2 title', max: 40, def: '2. Pick equipment' },
  { key: 'step2_text', label: 'Step 2 text', max: 160, def: 'Browse by department and category, then check the description and available quantity.', long: true },
  { key: 'step3_title', label: 'Step 3 title', max: 40, def: '3. Submit the form' },
  { key: 'step3_text', label: 'Step 3 text', max: 160, def: 'Fill in the borrow date, return date and your purpose. All three are required.', long: true },
  { key: 'step4_title', label: 'Step 4 title', max: 40, def: '4. Return with proof' },
  { key: 'step4_text', label: 'Step 4 text', max: 160, def: 'After approval, claim the item. On return, upload a photo as proof so you can borrow again.', long: true },
  { key: 'dept_title', label: 'Departments section title', max: 60, def: 'Equipments by Department' },
  { key: 'dept_lead', label: 'Departments section paragraph', max: 240, def: 'Every item is listed under the department that owns it. Open one to see its photo, status and details.', long: true },
  { key: 'about_title', label: 'About title (dark part)', max: 60, def: 'Built for the' },
  { key: 'about_accent', label: 'About title (blue part)', max: 60, def: 'CSPC community' },
  { key: 'about_text', label: 'About paragraph', max: 500, def: 'EquiHub (hiram means \u201cborrow\u201d) lets students, faculty and employees request equipment from their department online, and lets the equipment office track every item from request to return.', long: true },
  { key: 'home_items', label: 'Items shown per department on the homepage (2-8)', max: 1, def: '4', number: true }
];
const DEFAULTS = Object.fromEntries(FIELDS.map((f) => [f.key, f.def]));

async function getAll() {
  const out = { ...DEFAULTS };
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM site_settings');
    rows.forEach((r) => { if (r.setting_key in DEFAULTS) out[r.setting_key] = r.setting_value; });
  } catch (e) { console.error('settings:', e.message); } // table missing -> defaults, site still works
  return out;
}
async function setMany(values) {
  for (const f of FIELDS) {
    if (typeof values[f.key] !== 'string') continue;
    await db.query('INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [f.key, values[f.key]]);
  }
}
const reset = () => db.query('DELETE FROM site_settings');
module.exports = { FIELDS, DEFAULTS, getAll, setMany, reset };
