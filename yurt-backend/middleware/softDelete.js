// ╔══════════════════════════════════════════════════════════════════╗
// ║  SOFT DELETE YARDIMCI FONKSİYONLARI (middleware/softDelete.js) ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Tekrar eden soft-delete / restore mantığını tek yerden         ║
// ║  yönetir.                                                        ║
// ║                                                                  ║
// ║  Kullanım:                                                       ║
// ║    const { softDelete, softRestore } =                          ║
// ║      require('../middleware/softDelete');                        ║
// ║                                                                  ║
// ║    await softDelete(pool, 'announcements', id, req.user.id);    ║
// ║    await softRestore(pool, 'announcements', id);                ║
// ╚══════════════════════════════════════════════════════════════════╝

/**
 * Belirtilen tablodaki kaydı soft-delete yapar.
 *
 * @param {object} pool       - pg Pool bağlantısı
 * @param {string} table      - Tablo adı (schema prefix olmadan; public. eklenir)
 * @param {number} id         - Silinecek kaydın ID'si
 * @param {number} deletedBy  - Silme işlemini yapan kullanıcının ID'si (JWT'den)
 * @returns {Promise<number>} - Etkilenen satır sayısı (0 = kayıt bulunamadı)
 */
async function softDelete(pool, table, id, deletedBy) {
  const result = await pool.query(
    `UPDATE ${table}
     SET is_deleted = TRUE,
         deleted_at = NOW(),
         deleted_by = $1
     WHERE id = $2 AND is_deleted = FALSE`,
    [deletedBy, id]
  );
  return result.rowCount;
}

/**
 * Soft-delete edilmiş kaydı geri yükler.
 *
 * @param {object} pool  - pg Pool bağlantısı
 * @param {string} table - Tablo adı
 * @param {number} id    - Geri yüklenecek kaydın ID'si
 * @returns {Promise<number>} - Etkilenen satır sayısı (0 = kayıt bulunamadı)
 */
async function softRestore(pool, table, id) {
  const result = await pool.query(
    `UPDATE ${table}
     SET is_deleted = FALSE,
         deleted_at = NULL,
         deleted_by = NULL
     WHERE id = $1 AND is_deleted = TRUE`,
    [id]
  );
  return result.rowCount;
}

module.exports = { softDelete, softRestore };
