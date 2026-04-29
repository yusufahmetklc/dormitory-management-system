// ╔══════════════════════════════════════════════════════════════════╗
// ║  MAİL ROUTE'LARI (routes/mailRoutes.js)                        ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Email doğrulama, şifre sıfırlama ve test mail gönderimi.     ║
// ║  Nodemailer kütüphanesi kullanılır.                             ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /verify-email   → Email doğrulama linki kontrolü        ║
// ║  POST /forgot-password→ Şifre sıfırlama emaili gönder          ║
// ║  POST /reset-password → Yeni şifre belirle                     ║
// ║  GET  /test-mail      → Test emaili gönder                     ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const transporter = require("../config/mail");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
require("dotenv").config();

const router = express.Router();

const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// ------------------------------------
// GET /verify-email?token=xxx
// Email doğrulama linki tıklandığında çalışır
// Token'a sahip kullanıcıyı doğrulanmış olarak işaretler
// ------------------------------------
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Geçersiz link.");
  }

  try {
    // Token ile kullanıcıyı bul
    const result = await pool.query(
      "SELECT id FROM users WHERE password_reset_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send("Token geçersiz veya süresi dolmuş.");
    }

    // Kullanıcıyı doğrulanmış olarak güncelle
    await pool.query(
      `UPDATE users
       SET is_email_verified = TRUE,
           email_verified_at = NOW(),
           password_reset_token = NULL
       WHERE password_reset_token = $1`,
      [token]
    );

    res.send("Email başarıyla doğrulandı. Artık giriş yapabilirsiniz.");
  } catch (err) {
    console.error("Email doğrulama hatası:", err);
    res.status(500).send("Sunucu hatası.");
  }
});

// ------------------------------------
// POST /forgot-password
// Şifre sıfırlama isteği — email'e reset linki gönderir
// Güvenlik: Kullanıcı bulunamazsa bile aynı mesajı döner
// ------------------------------------
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email gerekli." });
  }

  try {
    const result = await pool.query(
      "SELECT id, is_email_verified FROM users WHERE email = $1",
      [email]
    );

    // Güvenlik için her durumda aynı mesaj döneriz (email enumeration koruması)
    const safeMessage = "Eğer email sistemde kayıtlıysa şifre sıfırlama linki gönderildi.";

    if (result.rows.length === 0) {
      return res.json({ success: true, message: safeMessage });
    }

    const user = result.rows[0];

    // Doğrulanmamış email için de aynı mesaj
    if (!user.is_email_verified) {
      return res.json({ success: true, message: safeMessage });
    }

    // Rastgele reset token oluştur (32 byte hex)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 saat geçerli

    // Token'ı veritabanına kaydet
    await pool.query(
      `UPDATE users
       SET password_reset_token = $1,
           password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, expiry, user.id]
    );

    // Sıfırlama linkini email ile gönder
    const resetLink = `${APP_BASE_URL}/api/auth/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: '"Yurt Sistemi" <no-reply@yurt.com>',
      to: email,
      subject: "Şifre Sıfırlama",
      text: `Şifrenizi sıfırlamak için bu linke tıklayın:\n${resetLink}`,
    });

    res.json({ success: true, message: safeMessage });
  } catch (err) {
    console.error("Şifre sıfırlama isteği hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
});

// ------------------------------------
// GET /reset-password?token=xxx
// Şifre sıfırlama formu — token geçerliyse HTML form gösterir
// ------------------------------------
router.get("/reset-password", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.send("Geçersiz link.");
  }

  try {
    const result = await pool.query(
      "SELECT id, password_reset_expires FROM users WHERE password_reset_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.send(styledMessage("⚠️ Token Geçersiz", "Bu sıfırlama bağlantısı geçersiz. Lütfen yeni bir sıfırlama isteği oluşturun.", "error"));
    }

    // Token süresi dolmuş mu kontrol et
    if (new Date() > result.rows[0].password_reset_expires) {
      return res.send(styledMessage("⏰ Süre Doldu", "Bu bağlantının süresi dolmuş. Lütfen yeni bir sıfırlama isteği oluşturun.", "error"));
    }

    // Sanitize: token should only contain hex chars
    const safeToken = String(token).replace(/[^a-f0-9]/gi, "");

    // Şifre değiştirme formunu göster
    res.send(styledResetForm(safeToken));
  } catch (err) {
    console.error("Reset form hatası:", err);
    res.send(styledMessage("❌ Hata", "Sunucu hatası oluştu.", "error"));
  }
});

// Stillendirilmiş mesaj sayfası (hata veya bilgi)
function styledMessage(title, body, type) {
  const color = type === 'error' ? '#ef4444' : '#10b981';
  const bg    = type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)';
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yurt Yönetim Sistemi</title>
<style>${resetPageCSS()}</style></head><body>
<div class="live-bg"><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>
<div class="card">
  <div class="card-head"><h1>Yurt Yönetim Sistemi</h1></div>
  <div class="card-body">
    <div style="background:${bg};border:1px solid ${color}40;border-radius:10px;padding:16px;color:${color};font-size:14px;text-align:center;">
      <div style="font-size:24px;margin-bottom:8px;">${title}</div>
      <div>${body}</div>
    </div>
    <a href="/" class="btn" style="display:block;margin-top:20px;text-align:center;">Giriş Sayfasına Dön</a>
  </div>
</div>
</body></html>`;
}

// Stillendirilmiş şifre sıfırlama formu
function styledResetForm(token) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yeni Şifre Belirle — Yurt Yönetim Sistemi</title>
<style>${resetPageCSS()}</style></head><body>
<div class="live-bg"><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>
<div class="card">
  <div class="card-head">
    <h1>Yurt Yönetim Sistemi</h1>
    <p>Yeni Şifre Belirle</p>
  </div>
  <div class="card-body">
    <div class="msg msg-error" id="err"></div>
    <div class="msg msg-success" id="suc"></div>
    <div class="form-group">
      <label>Yeni Şifre</label>
      <input type="password" id="p1" class="form-control" placeholder="Yeni Şifreniz" autofocus>
    </div>
    <div class="form-group">
      <label>Yeni Şifre (Tekrar)</label>
      <input type="password" id="p2" class="form-control" placeholder="Şifreyi tekrar girin">
    </div>
    <div class="hint">⚠️ Minimum 8 karakter, büyük/küçük harf, rakam ve özel karakter (@$!%*?&) içermelidir.</div>
    <button class="btn" id="btn" onclick="submitReset()">Yeni Şifreyi Kaydet</button>
  </div>
</div>
<script>
async function submitReset() {
  const p1 = document.getElementById('p1').value;
  const p2 = document.getElementById('p2').value;
  const err = document.getElementById('err');
  const suc = document.getElementById('suc');
  const btn = document.getElementById('btn');
  err.style.display = 'none';
  suc.style.display = 'none';
  if (!p1 || !p2) { err.textContent = 'Lütfen tüm alanları doldurun.'; err.style.display='block'; return; }
  if (p1 !== p2)  { err.textContent = 'Şifreler eşleşmiyor.'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent = 'Kaydediliyor...';
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '${token}', newPassword: p1 })
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.message || 'Bir hata oluştu.';
      err.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Yeni Şifreyi Kaydet';
    } else {
      suc.textContent = data.message + ' Giriş sayfasına yönlendiriliyorsunuz...';
      suc.style.display = 'block';
      btn.style.display = 'none';
      setTimeout(() => window.location.href = '/', 2500);
    }
  } catch {
    err.textContent = 'Sunucuya bağlanılamadı.';
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Yeni Şifreyi Kaydet';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') submitReset(); });
<\/script>
</body></html>`;
}

// Ortak CSS (hem form hem mesaj sayfası kullanır)
function resetPageCSS() {
  return `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0b0b14;min-height:100vh;
      display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden}
    .live-bg{position:fixed;inset:0;z-index:0;overflow:hidden;
      background:linear-gradient(135deg,#0b0b14 0%,#0d1117 40%,#111827 100%)}
    .live-bg .orb{position:absolute;border-radius:50%;filter:blur(80px);
      animation:orbFloat 20s ease-in-out infinite;opacity:0.4}
    .live-bg .orb:nth-child(1){width:500px;height:500px;top:-10%;left:-5%;
      background:radial-gradient(circle,#6366f1,transparent 70%);animation-duration:22s}
    .live-bg .orb:nth-child(2){width:400px;height:400px;top:50%;right:-8%;
      background:radial-gradient(circle,#06b6d4,transparent 70%);animation-duration:18s;animation-delay:-5s}
    .live-bg .orb:nth-child(3){width:350px;height:350px;bottom:-5%;left:30%;
      background:radial-gradient(circle,#8b5cf6,transparent 70%);animation-duration:25s;animation-delay:-10s}
    @keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}25%{transform:translate(40px,-30px) scale(1.05)}
      50%{transform:translate(-20px,40px) scale(0.95)}75%{transform:translate(30px,20px) scale(1.02)}}
    .card{background:rgba(30,30,46,0.85);border-radius:16px;
      box-shadow:0 20px 60px rgba(0,0,0,0.4);width:100%;max-width:420px;
      overflow:hidden;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      border:1px solid rgba(99,102,241,0.15);position:relative;z-index:1}
    .card-head{background:linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.25));
      padding:28px 32px 24px;text-align:center;color:#fff;
      border-bottom:1px solid rgba(99,102,241,0.15)}
    .card-head h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
    .card-head p{font-size:13px;color:#a5b4fc;opacity:0.85}
    .card-body{padding:28px 32px}
    .form-group{margin-bottom:18px}
    .form-group label{display:block;font-size:13px;font-weight:600;color:#a6adc8;margin-bottom:6px}
    .form-control{width:100%;padding:12px 16px;border:1.5px solid rgba(99,102,241,0.2);
      border-radius:10px;font-size:14px;transition:all 0.2s;
      background:rgba(17,17,27,0.6);color:#cdd6f4}
    .form-control::placeholder{color:#6c7086}
    .form-control:focus{outline:none;border-color:#6366f1;background:rgba(17,17,27,0.8);
      box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
    .btn{width:100%;padding:13px;
      background:linear-gradient(135deg,#6366f1,#8b5cf6);
      color:#fff;border:none;border-radius:10px;
      font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;
      box-shadow:0 4px 12px rgba(99,102,241,0.3);text-decoration:none}
    .btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,0.45)}
    .btn:disabled{opacity:0.7;cursor:not-allowed;transform:none}
    .hint{font-size:12px;color:#6c7086;margin-bottom:18px;line-height:1.5;
      padding:10px 14px;background:rgba(99,102,241,0.07);border-radius:8px;
      border:1px solid rgba(99,102,241,0.1)}
    .msg{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none}
    .msg-error{background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.25)}
    .msg-success{background:rgba(16,185,129,0.12);color:#6ee7b7;border:1px solid rgba(16,185,129,0.25)}
  `;
}

// ------------------------------------
// POST /reset-password
// Şifre sıfırlama formundan gelen yeni şifreyi kaydeder
// Şifre politikası: min 8 kar, büyük/küçük harf, rakam, özel karakter
// ------------------------------------
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: "Eksik bilgi." });
  }

  try {
    const result = await pool.query(
      "SELECT id, password_reset_expires FROM users WHERE password_reset_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Token geçersiz." });
    }

    // Token süresi kontrolü
    if (new Date() > result.rows[0].password_reset_expires) {
      return res.status(400).json({ success: false, message: "Token süresi dolmuş. Lütfen yeni bir sıfırlama isteği oluşturun." });
    }

    // Şifre politikası kontrolü
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ success: false, message: "Şifre politikasına uygun değil. Min 8 karakter, büyük/küçük harf, rakam ve özel karakter (@$!%*?&) gereklidir." });
    }

    // Yeni şifreyi hashle ve kaydet, token'ı temizle
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           update_date = NOW()
       WHERE password_reset_token = $2`,
      [newHash, token]
    );

    res.json({ success: true, message: "Şifre başarıyla güncellendi." });
  } catch (err) {
    console.error("Şifre sıfırlama hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
});

// ------------------------------------
// POST /admin-reset-password
// Admin: kullanıcı adına sıfırlama linki gönderir
// Body: { userId }
// ------------------------------------
router.post("/admin-reset-password",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "userId gerekli" });

    try {
      const result = await pool.query(
        "SELECT id, email, is_email_verified FROM users WHERE id = $1",
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }

      const user = result.rows[0];
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

      await pool.query(
        `UPDATE users
         SET password_reset_token = $1, password_reset_expires = $2
         WHERE id = $3`,
        [resetToken, expiry, user.id]
      );

      const resetLink = `${APP_BASE_URL}/api/auth/reset-password?token=${resetToken}`;
      await transporter.sendMail({
        from: '"Yurt Sistemi" <no-reply@yurt.com>',
        to: user.email,
        subject: "Şifre Sıfırlama — Yönetici İsteği",
        text: `Yönetici tarafından bir şifre sıfırlama isteği oluşturuldu.\n\nLinke tıklayarak yeni şifyrenizi belirleyin:\n${resetLink}\n\nLink 1 saat geçerlidir.`,
      });

      res.json({ success: true, message: "Şifre sıfırlama linki gönderildi" });
    } catch (err) {
      console.error("Admin şifre sıfırlama hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /test-mail
// Mail gönderim testi — SMTP ayarlarının doğruluğunu kontrol eder
// ------------------------------------
router.get("/test-mail", async (req, res) => {
  try {
    await transporter.sendMail({
      from: '"Yurt Sistemi" <no-reply@yurt.com>',
      to: "test@example.com",
      subject: "Mailtrap Test",
      text: "Mail gönderme başarılı.",
    });
    res.send("Mail gönderildi.");
  } catch (error) {
    console.error("Mail gönderim hatası:", error);
    res.status(500).send("Mail gönderilemedi.");
  }
});

module.exports = router;
