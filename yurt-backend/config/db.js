// ╔══════════════════════════════════════════════════════════════════╗
// ║  VERİTABANI BAĞLANTI YAPILANDIRMASI (config/db.js)             ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  PostgreSQL veritabanına bağlanmak için "bağlantı havuzu"       ║
// ║  (connection pool) oluşturur.                                   ║
// ║                                                                  ║
// ║  BAĞLANTI HAVUZU NE İŞE YARAR?                                 ║
// ║  Her API isteğinde yeni bir DB bağlantısı açmak yavaştır.       ║
// ║  Havuz, birkaç bağlantıyı açık tutar ve ihtiyaç olduğunda      ║
// ║  bunlardan birini kullanıma verir. İş bitince geri alır.        ║
// ║                                                                  ║
// ║  KULLANILAN VERİTABANI:                                         ║
// ║  • Servis: Neon (bulut tabanlı serverless PostgreSQL)           ║
// ║  • Bölge: US-East-1 (AWS)                                      ║
// ║  • Veritabanı adı: neondb                                      ║
// ║  • SSL zorunlu (Neon gerekliliği)                               ║
// ╚══════════════════════════════════════════════════════════════════╝

// pg modülünden Pool sınıfını al — bağlantı havuzu oluşturur
const { Pool } = require("pg");
require("dotenv").config();

// Bağlantı havuzu oluştur — tüm route dosyaları bunu kullanır
// Parametreler .env dosyasından okunur, yoksa varsayılan değerler kullanılır
const pool = new Pool({
  user:     process.env.DB_USER,                       // DB kullanıcı adı (.env'den okunur)
  host:     process.env.DB_HOST,                       // Neon sunucu adresi (.env'den okunur)
  database: process.env.DB_NAME,                       // Veritabanı adı (.env'den okunur)
  password: process.env.DB_PASSWORD,                   // Veritabanı şifresi (.env'den okunur)
  port:     Number(process.env.DB_PORT) || 5432,       // PostgreSQL varsayılan port
  ssl:      { rejectUnauthorized: false },              // Neon için SSL bağlantısı zorunlu
});

//PostgreSQL’de: aynı DB içinde birden fazla “şema (schema)” olabilir
pool.on('connect', (client) => {
  client.query('SET search_path TO belek_dormitory_module, belek_dormitory, public');
});
// pool objesi dışa aktarılır → diğer dosyalar require('./config/db') ile kullanır
// Kullanım: const pool = require('./config/db');
//           const result = await pool.query('SELECT * FROM users');
module.exports = pool;
