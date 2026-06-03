const pool = require('./config/db');
const MAP = [
  ['Bilgisayar Programcılığı','Meslek Yüksekokulu'],
  ['Yazılım Mühendisliği','Mühendislik Fakültesi'],
  ['Bilgisayar Mühendisliği','Mühendislik Fakültesi'],
  ['Elektrik-Elektronik','Mühendislik Fakültesi'],
  ['İnşaat Mühendisliği','Mühendislik Fakültesi'],
  ['Makine Mühendisliği','Mühendislik Fakültesi'],
  ['Mühendislik','Mühendislik Fakültesi'],
  ['İşletme','İktisadi ve İdari Bilimler Fakültesi'],
  ['Ekonomi','İktisadi ve İdari Bilimler Fakültesi'],
  ['İktisat','İktisadi ve İdari Bilimler Fakültesi'],
  ['Maliye','İktisadi ve İdari Bilimler Fakültesi'],
  ['Kamu Yönetimi','İktisadi ve İdari Bilimler Fakültesi'],
  ['Matematik','Fen-Edebiyat Fakültesi'],
  ['Fizik','Fen-Edebiyat Fakültesi'],
  ['Biyoloji','Fen-Edebiyat Fakültesi'],
  ['Kimya','Fen-Edebiyat Fakültesi'],
  ['Tarih','Fen-Edebiyat Fakültesi'],
  ['Psikoloji','Fen-Edebiyat Fakültesi'],
  ['Sosyoloji','Fen-Edebiyat Fakültesi'],
  ['Felsefe','Fen-Edebiyat Fakültesi'],
  ['Hukuk','Hukuk Fakültesi'],
  ['Hemşirelik','Sağlık Bilimleri Fakültesi'],
  ['Sağlık','Sağlık Bilimleri Fakültesi'],
  ['Tıp','Tıp Fakültesi'],
  ['Eczacılık','Eczacılık Fakültesi'],
  ['Diş','Diş Hekimliği Fakültesi'],
  ['Mimarlık','Mimarlık Fakültesi'],
  ['İç Mimarlık','Mimarlık Fakültesi'],
  ['Radyo','İletişim Fakültesi'],
  ['Televizyon','İletişim Fakültesi'],
  ['Sinema','İletişim Fakültesi'],
  ['Gazetecilik','İletişim Fakültesi'],
  ['İletişim','İletişim Fakültesi'],
  ['Eğitim','Eğitim Fakültesi'],
  ['Gastronomi','Turizm Fakültesi'],
  ['Turizm','Turizm Fakültesi'],
  ['Güzel Sanatlar','Güzel Sanatlar Fakültesi'],
];
function guess(dept) {
  if (!dept) return null;
  const d = dept.toLowerCase();
  for (const [k,v] of MAP.sort((a,b)=>b[0].length-a[0].length)) {
    if (d.includes(k.toLowerCase())) return v;
  }
  return null;
}
async function run() {
  try {
    const {rows} = await pool.query("SELECT id,department FROM public.users WHERE user_type='Öğrenci' AND (faculty IS NULL OR faculty='')");
    console.log('Fakülte atanacak:', rows.length);
    for (const r of rows) {
      const f = guess(r.department);
      if (f) {
        await pool.query("UPDATE public.users SET faculty=$1,update_date=NOW() WHERE id=$2",[f,r.id]);
        console.log(' ✓',r.id,r.department,'→',f);
      } else {
        console.log(' ?',r.id,r.department,'→ eşleşme yok');
      }
    }
    const cr = await pool.query("UPDATE public.users SET class_year=FLOOR(RANDOM()*6+1)::INTEGER,update_date=NOW() WHERE user_type='Öğrenci' AND class_year IS NULL");
    console.log('Sınıf güncellenen:',cr.rowCount);
    const {rows:[s]} = await pool.query("SELECT COUNT(*) FILTER(WHERE user_type='Öğrenci') t, COUNT(*) FILTER(WHERE user_type='Öğrenci' AND faculty IS NOT NULL AND faculty!='') f, COUNT(*) FILTER(WHERE user_type='Öğrenci' AND class_year IS NOT NULL) c FROM public.users");
    console.log('Özet — Toplam:',s.t,'Fakülte dolu:',s.f,'Sınıf dolu:',s.c);
  } catch(e){ console.error('HATA:',e.message); }
  finally { await pool.end(); }
}
run();
