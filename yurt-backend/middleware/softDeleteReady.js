// Soft delete sütunlarının veritabanında var olup olmadığını kontrol eder.
// Sonuç önbelleğe alınır — sunucu ömrü boyunca tek sorguda çözülür.
// Migration uygulandıktan sonra sunucu yeniden başlatılırsa otomatik aktif olur.

const pool = require('../config/db');
const _cache = {};

async function isReady(schema, table) {
  const key = `${schema}.${table}`;
  if (_cache[key] !== undefined) return _cache[key];
  try {
    await pool.query(`SELECT is_deleted FROM ${schema}.${table} LIMIT 0`);
    _cache[key] = true;
  } catch {
    _cache[key] = false;
  }
  return _cache[key];
}

module.exports = {
  usersReady:         () => isReady('public', 'users'),
  announcementsReady: () => isReady('belek_dormitory_module', 'announcements'),
  complaintsReady:    () => isReady('belek_dormitory_module', 'complaints'),
  roomsReady:         () => isReady('belek_dormitory_module', 'rooms'),
};
