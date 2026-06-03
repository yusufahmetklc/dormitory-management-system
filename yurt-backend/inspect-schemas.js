const pool = require('./config/db');
async function run() {
  try {
    await pool.query("SET search_path TO belek_dormitory_module, belek_dormitory, public");
    
    const r = await pool.query(`
      SELECT id, first_name, last_name, user_type, is_active
      FROM public.users WHERE user_type='Öğrenci' ORDER BY id
    `);
    console.log('Tüm Öğrenciler:', r.rows.length);
    r.rows.forEach(u => console.log(` ${u.id} ${u.first_name} ${u.last_name} | is_active=${u.is_active}`));
    
    const r2 = await pool.query(`SELECT COUNT(*) FILTER(WHERE user_type='Öğrenci') AS total, COUNT(*) FILTER(WHERE user_type='Öğrenci' AND is_active=TRUE) AS active FROM public.users`);
    console.log('Toplam öğrenci:', r2.rows[0].total, '| Aktif:', r2.rows[0].active);
  } catch(e) { console.error('Hata:', e.message); }
  finally { await pool.end(); }
}
run();

