const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function run() {
  const hash = await bcrypt.hash('YusufAhmet7005@2026', 10);
  // RLS politikalarını listele
  const policies = await pool.query(
    "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'"
  );
  console.log('RLS politikaları:', JSON.stringify(policies.rows, null, 2));

  // Mevcut kullanıcı kim?
  const whoami = await pool.query('SELECT current_user, session_user');
  console.log('Bağlı kullanıcı:', whoami.rows[0]);
  await pool.end();
}

run().catch(e => { console.error(e.message); pool.end(); });
