// Overdue handling: in-app notification (shows in the side menu) + e-mail to the borrower.
// Runs automatically every 6 hours (at most ONE reminder per request per day) and on demand from the admin panel.
const { db } = require('../db');
const { sendMail } = require('./mailer');

const BASE = 'SELECT b.id, b.user_id, b.reference_no, b.return_date, b.quantity, e.name AS equipment_name, u.full_name, u.email, ' +
  'DATEDIFF(CURDATE(), b.return_date) AS days FROM borrow_requests b JOIN equipment e ON e.id = b.equipment_id JOIN users u ON u.id = b.user_id ' +
  "WHERE b.status = 'approved' AND b.return_date < CURDATE()";

async function remind(r) {
  const late = r.days + (r.days === 1 ? ' day' : ' days');
  const msg = ('Overdue: ' + r.equipment_name + ' x' + r.quantity + ' (' + r.reference_no + ') was due ' + r.return_date + ' and is ' + late + ' late. Please return it and upload your proof photo.').slice(0, 255);
  await db.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [r.user_id, msg, '/account/requests/' + r.id]);
  await sendMail(r.email, 'Overdue equipment - ' + r.reference_no,
    'Hello ' + r.full_name + ',\n\nThis is a reminder that the equipment below is past its return date:\n\n' +
    '  Equipment : ' + r.equipment_name + ' x' + r.quantity + '\n  Reference : ' + r.reference_no + '\n  Due date  : ' + r.return_date + '\n  Days late : ' + r.days + '\n\n' +
    'Please return it to the equipment office and upload your return photo here:\n' + (process.env.BASE_URL || '') + '/account/requests/' + r.id + '\n\n' +
    'Further delays may lead to your borrowing privileges being suspended.\n\nCSPC EquiHub');
}

// force = true ignores the once-per-day limit (admin pressed "Send reminder")
async function runOverdueReminders({ id = null, force = false } = {}) {
  const [rows] = await db.query(BASE + (id ? ' AND b.id = ?' : ''), id ? [id] : []);
  let sent = 0;
  for (const r of rows) {
    const [u] = await db.query(
      'UPDATE borrow_requests SET last_reminder_at = CURDATE(), reminder_count = reminder_count + 1 WHERE id = ?' +
      (force ? '' : ' AND (last_reminder_at IS NULL OR last_reminder_at < CURDATE())'), [r.id]); // claim first: two servers never double-send
    if (u.affectedRows !== 1) continue;
    await remind(r); sent++;
  }
  if (sent) await db.query("INSERT INTO notifications (user_id, message, link) SELECT id, ?, '/admin/overdue' FROM users WHERE role = 'admin'",
    ['Overdue reminders sent to ' + sent + ' borrower' + (sent === 1 ? '' : 's') + '.']);
  return sent;
}

function start() {
  const run = () => runOverdueReminders().then((n) => { if (n) console.log('Overdue reminders sent:', n); }).catch((e) => console.error('overdue job:', e.message));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
module.exports = { runOverdueReminders, start };
