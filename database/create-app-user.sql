-- Run this as root in phpMyAdmin (SQL tab) or:  mysql -u root -p < database/create-app-user.sql
-- Safe to run again any time you get "Access denied for user 'hiramhub_app'".
-- Replace CHANGE_ME with the same value as DB_PASSWORD in your .env.

CREATE DATABASE IF NOT EXISTS cspc_hiramhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- One account per way Node can reach MariaDB (hostname, IPv4, IPv6)
CREATE USER IF NOT EXISTS 'hiramhub_app'@'localhost' IDENTIFIED BY 'CHANGE_ME';
CREATE USER IF NOT EXISTS 'hiramhub_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
CREATE USER IF NOT EXISTS 'hiramhub_app'@'::1'       IDENTIFIED BY 'CHANGE_ME';

-- Re-sync the password in case the user already existed with a different one
ALTER USER 'hiramhub_app'@'localhost' IDENTIFIED BY 'CHANGE_ME';
ALTER USER 'hiramhub_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
ALTER USER 'hiramhub_app'@'::1'       IDENTIFIED BY 'CHANGE_ME';

GRANT ALL PRIVILEGES ON cspc_hiramhub.* TO 'hiramhub_app'@'localhost';
GRANT ALL PRIVILEGES ON cspc_hiramhub.* TO 'hiramhub_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON cspc_hiramhub.* TO 'hiramhub_app'@'::1';
FLUSH PRIVILEGES;
