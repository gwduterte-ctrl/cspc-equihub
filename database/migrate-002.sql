-- Run ONCE if you created the database before the admin update (departments, homepage content, overdue reminders).
USE cspc_hiramhub;
ALTER TABLE departments     ADD COLUMN logo VARCHAR(160) NULL;
ALTER TABLE equipment       ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE borrow_requests ADD COLUMN last_reminder_at DATE NULL, ADD COLUMN reminder_count INT UNSIGNED NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key   VARCHAR(40)  NOT NULL PRIMARY KEY,
  setting_value VARCHAR(600) NOT NULL
);
