const pool = require('./config/db');
async function inspect() {
  const schemas = await pool.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name"
  );
  console.log('=== SCHEMALAR ===');
  schemas.rows.forEach(r => console.log(' -', r.schema_name));

  const tables = await pool.query(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name"
  );
  console.log('\n=== TABLOLAR ===');
  tables.rows.forEach(r => console.log(' -', r.table_schema + '.' + r.table_name));

  const cols = await pool.query(
    "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE column_name IN ('is_deleted','deleted_at','deleted_by') ORDER BY table_schema, table_name, column_name"
  );
  console.log('\n=== MEVCUT SOFT DELETE SUTUNLARI ===');
  if (cols.rows.length === 0) {
    console.log(' (yok - migration henuz calistirilmamis)');
  } else {
    cols.rows.forEach(r => console.log(' -', r.table_schema + '.' + r.table_name + '.' + r.column_name, '(' + r.data_type + ')'));
  }
  await pool.end();
}
inspect().catch(e => { console.error(e.message); process.exit(1); });
