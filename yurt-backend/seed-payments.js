/**
 * seed-payments.js
 * Raporlama grafiklerinin çalışması için gerçekçi ödeme verisi ekler.
 * Çalıştır: node seed-payments.js
 */
const pool = require('./config/db');

async function seed() {
  try {
    // Schema yolunu açıkça ayarla
    await pool.query("SET search_path TO belek_dormitory_module, belek_dormitory, public");

    // Aktif öğrencileri çek
    const students = await pool.query(
      `SELECT id, first_name, last_name FROM users
       WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 20`
    );
    if (students.rows.length === 0) {
      console.log('Hiç aktif öğrenci bulunamadı.');
      return;
    }
    console.log(`${students.rows.length} öğrenci bulundu, ödemeler ekleniyor...`);

    const sIds = students.rows.map(s => s.id);
    const now   = new Date();
    const year  = now.getFullYear();
    const inserted = [];

    // Son 6 ay için ödeme verisi oluştur
    for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
      const d = new Date(year, now.getMonth() - monthOffset, 15);
      const paymentDateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const monthNum = d.getMonth() + 1;
      const monthYear = d.getFullYear();

      const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                         'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
      const monthName = TR_MONTHS[d.getMonth()];

      for (let i = 0; i < sIds.length; i++) {
        const userId = sIds[i];
        // Geçmiş aylar: çoğu ödendi, bir kısmı gecikmiş
        // Mevcut ve gelecek: beklemede veya gecikmiş
        let status, updatedAt;
        const r = Math.random();

        if (monthOffset >= 3) {
          // 3+ ay önce — büyük çoğunluk ödendi
          if (r < 0.80) {
            status = 'Ödendi';
            updatedAt = new Date(d.getTime() + Math.random() * 10 * 86400000).toISOString();
          } else {
            status = 'Gecikmiş';
            updatedAt = null;
          }
        } else if (monthOffset >= 1) {
          // 1-2 ay önce — bir kısmı hala beklemede/gecikmiş
          if (r < 0.65) {
            status = 'Ödendi';
            updatedAt = new Date(d.getTime() + Math.random() * 14 * 86400000).toISOString();
          } else if (r < 0.80) {
            status = 'Gecikmiş';
            updatedAt = null;
          } else {
            status = 'Beklemede';
            updatedAt = null;
          }
        } else {
          // Bu ay — çoğu beklemede
          if (r < 0.30) {
            status = 'Ödendi';
            updatedAt = new Date(d.getTime() + Math.random() * 5 * 86400000).toISOString();
          } else {
            status = 'Beklemede';
            updatedAt = null;
          }
        }

        // Rastgele tutar: 1500-3000 arası
        const amount = 1500 + Math.floor(Math.random() * 6) * 250;
        const description = `Aylık yurt ücreti — ${monthName} ${monthYear}`;

        const updateClause = updatedAt ? `'${updatedAt}'` : 'NULL';
        inserted.push(
          pool.query(
            `INSERT INTO payments (user_id, amount, status, payment_date, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, ${updateClause})`,
            [userId, amount, status, paymentDateStr, description]
          )
        );
      }
    }

    await Promise.all(inserted);
    console.log(`Toplam ${inserted.length} ödeme kaydı eklendi.`);

    // Özet göster
    const summary = await pool.query(
      `SELECT status, COUNT(*) AS adet, COALESCE(SUM(amount),0)::NUMERIC AS toplam
       FROM payments GROUP BY status ORDER BY status`
    );
    console.log('\nGüncel ödeme özeti:');
    summary.rows.forEach(r => {
      console.log(`  ${r.status || '(null)'}: ${r.adet} kayıt — ${Number(r.toplam).toLocaleString('tr-TR')}₺`);
    });

  } catch (err) {
    console.error('Hata:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
