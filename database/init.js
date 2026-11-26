// npm run db:init  - applies schema.sql (needs a MySQL user allowed to CREATE).
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    multipleStatements: true // only this one-off script; the app pool never enables it
  });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .replace(/cspc_hiramhub/g, process.env.DB_NAME || 'cspc_hiramhub');
  await conn.query(sql);
  console.log('Database ready.');
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
