// Week 6 - connection pool. Every query in this project is parameterised.
const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  // Managed MySQL hosts require TLS. Off locally (XAMPP has no TLS); on whenever DB_SSL=true.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  dateStrings: ['DATE'], // DATE columns come back as 'YYYY-MM-DD' strings (no timezone drift)
  multipleStatements: false // blocks stacked-query injection
});

module.exports = { db };
