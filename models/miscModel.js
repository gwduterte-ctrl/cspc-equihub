const { db } = require('../db');
const listNotifications = async (uid) => (await db.query('SELECT id, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [uid]))[0];
const markAllRead = (uid) => db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [uid]);
const userLogs = async (uid) => (await db.query('SELECT action, details, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [uid]))[0];
const allLogs = async (q = '') => {
  const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
  return (await db.query('SELECT l.action, l.details, l.actor_role, l.ip, l.created_at, u.full_name FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.action LIKE ? OR l.details LIKE ? OR u.full_name LIKE ? ORDER BY l.created_at DESC LIMIT 300', [like, like, like]))[0];
};
const clearOldLogs = async (days) => (await db.query('DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]))[0].affectedRows;
const deleteNotification = (uid, id) => db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, uid]);
const clearNotifications = (uid) => db.query('DELETE FROM notifications WHERE user_id = ?', [uid]);
module.exports = { deleteNotification, clearNotifications, clearOldLogs, listNotifications, markAllRead, userLogs, allLogs };
