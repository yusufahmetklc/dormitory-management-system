const pool = require('./config/db');

async function runQuery() {
  try {
    const result = await pool.query('SELECT DISTINCT user_type FROM users;');
    console.log('Kullanıcı tipleri:', result.rows);
  } catch (err) {
    console.error('Sorgu hatası:', err);
  } finally {
    await pool.end();
  }
}

runQuery();
