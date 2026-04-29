const pool = require('./config/db');

async function runMigrations() {
  try {
    await pool.query(`ALTER TABLE belek_dormitory_module.rooms ADD COLUMN IF NOT EXISTS current_occupancy INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE belek_dormitory_module.rooms ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;`);
    await pool.query(`ALTER TABLE belek_dormitory_module.rooms ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Boş';`);
    await pool.query(`ALTER TABLE belek_dormitory_module.room_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Aktif';`);
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

runMigrations();
