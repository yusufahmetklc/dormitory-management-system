// ==========================================
// Mail (SMTP) Yapılandırması
// Nodemailer ile email gönderimi için transporter
// ==========================================

const nodemailer = require("nodemailer");
require("dotenv").config();

// SMTP transporter — şifre sıfırlama ve email doğrulama mailleri gönderir
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
  port: Number(process.env.SMTP_PORT) || 2525,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

module.exports = transporter;
