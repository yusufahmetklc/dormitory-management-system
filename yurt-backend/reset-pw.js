const pool = require('./config/db');
require('dotenv').config();

async function check() {
  const r = await pool.query(
    "SELECT id, email, user_type, is_active FROM public.users ORDER BY id"
  );
  r.rows.forEach(u => console.log(u.id, u.user_type, u.is_active, u.email));
  await pool.end();
}

check().catch(e => { console.error(e.message); process.exit(1); });
