const pool = require('./config/db');
const fs = require('fs');

async function run() {
  const sql = fs.readFileSync('./migrations/011_soft_delete.sql', 'utf8');
  try {
    await pool.query(sql);
    console.log('011_soft_delete.sql migration basariyla calistirildi.');
  } catch (e) {
    console.error('HATA:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
