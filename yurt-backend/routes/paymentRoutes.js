// ╔══════════════════════════════════════════════════════════════════╗
// ║  ÖDEME YÖNETİMİ ROUTE'LARI (routes/paymentRoutes.js)          ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Yurt ücreti ödeme takibi, borç tanımlama ve raporlama.       ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET    /payments                    → Tüm ödemeleri listele  ║
// ║  GET    /payments/my                 → Öğrencinin kendi ödemeleri ║
// ║  GET    /payments/stats              → Ödeme istatistikleri   ║
// ║  POST   /payments                    → Yeni borç kaydı oluştur ║
// ║  PATCH  /payments/:id                → Durumu güncelle         ║
// ║  POST   /payments/monthly-installments → Aylık taksit planı   ║
// ║                                                                  ║
// ║  DURUM AKIŞI: Beklemede → Ödendi  (vade geçince → Gecikmiş)  ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// Vadesi geçmiş ödemeleri otomatik "Gecikmiş" olarak işaretle
async function autoMarkOverdue() {
  try {
    await pool.query(`
      UPDATE payments SET status = 'Gecikmiş', updated_at = NOW()
      WHERE status = 'Beklemede'
        AND payment_date IS NOT NULL
        AND payment_date < CURRENT_DATE
    `);
  } catch { /* silent */ }
}

// ------------------------------------
// POST /payments
// Yeni borç/ödeme kaydı oluşturur (Yönetici)
// Body: { user_id, amount, due_date?, description?, status? }
// Varsayılan durum: Beklemede (borc olarak eklenir)
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, amount, due_date, description, status } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: "Öğrenci ID ve tutar zorunlu" });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }

    const allowedStatuses = ['Beklemede', 'Ödendi', 'Gecikmiş'];
    const finalStatus = allowedStatuses.includes(status) ? status : 'Beklemede';

    try {
      const result = await pool.query(
        `INSERT INTO payments (user_id, amount, status, payment_date, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, amount, status, payment_date, description, created_at`,
        [parseInt(user_id), parseFloat(amount), finalStatus, due_date || null, description || null]
      );

      res.status(201).json({ success: true, message: "Ödeme kaydı oluşturuldu", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme kayıt hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /payments/:id
// Ödeme durumunu günceller (Yönetici)
// Body: { status } → 'Ödendi' | 'Beklemede' | 'Gecikmiş'
// ------------------------------------
router.patch("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ['Ödendi', 'Beklemede', 'Gecikmiş'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum değeri" });
    }

    try {
      const result = await pool.query(
        `UPDATE payments SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, user_id, amount, status, payment_date, description, updated_at`,
        [status, parseInt(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme durumu güncellendi", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /payments
// Ödeme kayıtlarını listeler (Yönetici)
// Query: ?user_id=23
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await autoMarkOverdue();
      const { user_id } = req.query;

      let query = `
        SELECT p.id, p.user_id, p.amount, p.status, p.payment_date,
               p.description, p.created_at, p.updated_at,
               u.first_name, u.last_name, u.email
        FROM payments p
        JOIN users u ON p.user_id = u.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      if (user_id) { query += ` AND p.user_id = $${idx++}`; params.push(user_id); }

      query += " ORDER BY p.payment_date ASC NULLS LAST, p.created_at DESC";

      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Ödeme listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /payments/my
// Öğrencinin kendi ödemeleri
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  try {
    await autoMarkOverdue();
    const result = await pool.query(
      `SELECT id, user_id, amount, status, payment_date, description, created_at
       FROM payments WHERE user_id = $1
       ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Ödeme geçmişi hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /payments/stats
// Ödeme istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) AS total_records,
          COALESCE(SUM(amount), 0)                                                            AS total_amount,
          COALESCE(SUM(CASE WHEN status = 'Ödendi' THEN amount ELSE 0 END), 0)               AS paid_amount,
          COALESCE(SUM(CASE WHEN status IN ('Beklemede','Gecikmiş') THEN amount ELSE 0 END), 0) AS unpaid_amount,
          COUNT(CASE WHEN status = 'Gecikmiş' THEN 1 END)                                    AS overdue_count
        FROM payments
      `);

      res.json({ success: true, data: { summary: stats.rows[0] } });
    } catch (err) {
      console.error("Ödeme istatistik hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /payments/monthly-installments
// Öğrenci için aylık taksit planı oluşturur (Yönetici)
// Body: { user_id, amount, start_date, months, description? }
// ------------------------------------
router.post("/monthly-installments",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, amount, start_date, months, description } = req.body;

    if (!user_id || !amount || !start_date || !months) {
      return res.status(400).json({ success: false, message: "Öğrenci, tutar, başlangıç tarihi ve ay sayısı zorunlu" });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }

    const monthCount = parseInt(months);
    if (monthCount < 1 || monthCount > 24) {
      return res.status(400).json({ success: false, message: "Ay sayısı 1-24 arasında olmalı" });
    }

    const startDate = new Date(start_date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ success: false, message: "Geçersiz başlangıç tarihi" });
    }

    try {
      const insertedIds = [];
      for (let i = 0; i < monthCount; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const desc = description ||
          `Aylık yurt ücreti — ${dueDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;

        const r = await pool.query(
          `INSERT INTO payments (user_id, amount, status, payment_date, description)
           VALUES ($1, $2, 'Beklemede', $3, $4)
           RETURNING id`,
          [parseInt(user_id), parseFloat(amount), dueDateStr, desc]
        );
        insertedIds.push(r.rows[0].id);
      }

      res.status(201).json({
        success: true,
        message: `${monthCount} aylık taksit planı oluşturuldu`,
        data: { created: monthCount, ids: insertedIds }
      });
    } catch (err) {
      console.error("Taksit oluşturma hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PUT /payments/:id
// Ödeme tutarını, vade tarihini ve açıklamasını günceller (Yönetici)
// Body: { amount?, due_date?, description? }
// ------------------------------------
router.put("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { amount, due_date, description } = req.body;
    const id = parseInt(req.params.id);

    if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (amount      !== undefined) { fields.push(`amount = $${idx++}`);       values.push(parseFloat(amount)); }
    if (due_date    !== undefined) { fields.push(`payment_date = $${idx++}`); values.push(due_date || null); }
    if (description !== undefined) { fields.push(`description = $${idx++}`);  values.push(description || null); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: "Güncellenecek alan belirtilmedi" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    try {
      const result = await pool.query(
        `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, user_id, amount, status, payment_date, description`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme güncellendi", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /payments/:id
// Ödeme kaydını siler (Yönetici)
// ------------------------------------
router.delete("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz ID" });
    }

    try {
      const result = await pool.query(
        `DELETE FROM payments WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme silindi" });
    } catch (err) {
      console.error("Ödeme silme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /payments/user/:id
// Belirli bir öğrencinin ödemeleri (Yönetici)
// ------------------------------------
router.get("/user/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await autoMarkOverdue();
      const result = await pool.query(
        `SELECT id, user_id, amount, status, payment_date, description, created_at
         FROM payments WHERE user_id = $1
         ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
        [parseInt(req.params.id)]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Kullanıcı ödeme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
