// ╔══════════════════════════════════════════════════════════════════╗
// ║  RETENTION (SÜRELI TEMİZLEME) JOB'U (jobs/cleanupJob.js)      ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Soft-delete edilmiş ve retention süresi dolmuş kayıtları       ║
// ║  kalıcı olarak siler. Her gün gece 02:00'de çalışır.           ║
// ║                                                                  ║
// ║  KAPSAM:                                                         ║
// ║  - announcements : 180 gün sonra kalıcı sil                    ║
// ║  - complaints    : 365 gün sonra kalıcı sil                    ║
// ║                                                                  ║
// ║  KAPSAM DIŞI (asla hard delete uygulanmaz):                    ║
// ║  - users / students / rooms                                     ║
// ║                                                                  ║
// ║  Entegrasyon (index.js içine):                                  ║
// ║    require('./jobs/cleanupJob');                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

const cron = require("node-cron");
const pool = require("../config/db");

// ─── Retention politikaları ──────────────────────────────────────
// Sadece bu tablolar hard-delete kapsamında. Gün cinsinden süre.
const RETENTION_POLICIES = [
  { table: "announcements", days: 180 },
  { table: "complaints",    days: 365 },
];

// ─── Tek tablo için temizleme fonksiyonu ─────────────────────────
async function purgeTable(table, days) {
  const result = await pool.query(
    `DELETE FROM ${table}
     WHERE is_deleted = TRUE
       AND deleted_at IS NOT NULL
       AND deleted_at < NOW() - ($1 || ' days')::INTERVAL
     RETURNING id`,
    [days]
  );
  return result.rowCount;
}

// ─── Ana temizleme fonksiyonu (tüm tablolar) ─────────────────────
async function runCleanup() {
  const startedAt = new Date().toISOString();
  console.log(`[Cleanup] Başladı — ${startedAt}`);

  let totalDeleted = 0;
  const results = [];

  for (const { table, days } of RETENTION_POLICIES) {
    try {
      const deleted = await purgeTable(table, days);
      totalDeleted += deleted;
      results.push({ table, days, deleted, status: "ok" });
      console.log(`[Cleanup] ${table}: ${deleted} kayıt kalıcı silindi (>${days} gün)`);
    } catch (err) {
      results.push({ table, days, deleted: 0, status: "error", error: err.message });
      console.error(`[Cleanup] ${table} temizleme hatası:`, err.message);
    }
  }

  console.log(`[Cleanup] Tamamlandı — Toplam ${totalDeleted} kayıt silindi`);
  return results;
}

// ─── Cron zamanlaması: Her gün 02:00 ─────────────────────────────
// Cron formatı: saniye(opsiyonel) dakika saat gün ay haftaGünü
// "0 2 * * *" → Her gün saat 02:00:00
cron.schedule("0 2 * * *", async () => {
  try {
    await runCleanup();
  } catch (err) {
    console.error("[Cleanup] Beklenmeyen hata:", err.message);
  }
}, {
  timezone: "Europe/Istanbul",
});

console.log("[Cleanup] Retention job zamanlandı — Her gün 02:00 (Europe/Istanbul)");

// runCleanup'ı dışa aktar: manuel tetiklemek veya test etmek için
module.exports = { runCleanup };
