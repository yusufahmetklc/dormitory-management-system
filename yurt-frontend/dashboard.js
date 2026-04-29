const API = '/api';
const token = localStorage.getItem('token');
const userType = localStorage.getItem('user_type');

if (!token) window.location.href = 'index.html';

const ROLE_MAP = {
  'Yönetici': 'admin', 'Admin': 'admin', 'SuperAdmin': 'admin',
  'Öğrenci': 'student',
  'Güvenlik': 'security',
  'Temizlik': 'cleaning',
  'Bakım': 'maintenance'
};

const role = ROLE_MAP[userType] || 'student';

const NAV = {
  admin: [
    { id: 'users',         icon: '👥', label: 'Kullanıcılar' },
    { id: 'rooms',         icon: '🏢', label: 'Odalar' },
    { id: 'payments',      icon: '💰', label: 'Ödemeler' },
    { id: 'announcements', icon: '📢', label: 'Duyurular' },
    { id: 'requests',      icon: '📋', label: 'Talepler' },
    { id: 'transfers',     icon: '🔄', label: 'Oda Transferleri' },
    { id: 'settings',      icon: '⚙️', label: 'Ayarlar' }
  ],
  student: [
    { id: 'room',          icon: '🏠', label: 'Odam' },
    { id: 'payments',      icon: '💰', label: 'Ödemelerim' },
    { id: 'announcements', icon: '📢', label: 'Duyurular' },
    { id: 'complaints',    icon: '📝', label: 'Taleplerim' },
    { id: 'transfers',     icon: '🔄', label: 'Oda Değişikliği' },
    { id: 'settings',      icon: '⚙️', label: 'Ayarlar' }
  ],
  security: [
    { id: 'visitor-logs',  icon: '👤', label: 'Ziyaretçiler' },
    { id: 'entry-logs',    icon: '📋', label: 'Giriş-Çıkış' },
    { id: 'settings',      icon: '⚙️', label: 'Ayarlar' }
  ],
  cleaning: [
    { id: 'cleaning-list', icon: '🧹', label: 'Temizlik Listesi' },
    { id: 'settings',      icon: '⚙️', label: 'Ayarlar' }
  ],
  maintenance: [
    { id: 'maint-list',    icon: '🔧', label: 'Bakım Talepleri' },
    { id: 'settings',      icon: '⚙️', label: 'Ayarlar' }
  ]
};

const ROLE_LABELS = {
  admin: 'Yönetici', student: 'Öğrenci',
  security: 'Güvenlik', cleaning: 'Temizlik', maintenance: 'Bakım'
};

const months = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// ── Utilities ────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  try {
    options.headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {})
    };
    const res = await fetch(API + url, options);
    if (res.status === 401) { logout(); return null; }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await res.json()
      : { message: await res.text(), success: res.ok };

    if (!res.ok) {
      showToast(data?.message || `Hata ${res.status}`);
      return null;
    }
    return data;
  } catch (err) {
    console.error('apiFetch hataı:', err);
    showToast('Sunucuya bağlanılamadı.');
    return null;
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function statusClass(s) {
  if (['Ödendi','Çözüldü','Onaylandı','Aktif','Dolu','Tamamlandı','Temizlendi'].includes(s)) return 'status-success';
  if (['Beklemede','Kısmi','Planlandı','Devam Ediyor'].includes(s)) return 'status-warning';
  if (['Gecikmiş','Reddedildi','Acil'].includes(s)) return 'status-danger';
  return 'status-info';
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('tr-TR');
}

function openModal(id) {
  document.getElementById('modal-' + id)?.classList.add('show');
}

function closeModal(id) {
  document.getElementById('modal-' + id)?.classList.remove('show');
}

// ── Sidebar ───────────────────────────────────────────────────────

function renderSidebar(user) {
  const nav = NAV[role];
  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-header">
      <img src="uni_logo.gif" alt="Logo" class="sidebar-logo" onerror="this.style.display='none'">
      <h2>🏠 Yurt Yönetim</h2>
      <div class="sub">${user ? (user.first_name || '') + ' ' + (user.last_name || '') : ''}</div>
      <div class="badge">${ROLE_LABELS[role]}</div>
    </div>
    <nav class="sidebar-nav">
      ${nav.map((item, i) => `
        <button class="nav-item ${i === 0 ? 'active' : ''}"
                data-page="${item.id}"
                onclick="go('${item.id}', this)">
          <span class="icon">${item.icon}</span>${item.label}
        </button>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <button class="nav-item logout-btn" onclick="logout()">
        <span class="icon">🚪</span>Çıkış Yap
      </button>
      <div style="padding:6px 0;border-top:1px solid rgba(99,102,241,.1);margin-top:4px">
        <button id="themeToggle" onclick="toggleTheme()"
          style="display:flex;align-items:center;gap:10px;padding:10px 20px;width:100%;
                 background:none;border:none;cursor:pointer;font-size:13px;
                 color:#64748b;transition:all .15s;text-align:left;">
          <span style="font-size:16px;width:22px;text-align:center" id="themeIcon">🌙</span>
          <span id="themeLabel">Koyu Tema</span>
        </button>
      </div>
    </div>
  `;
}

// ── Navigation ────────────────────────────────────────────────────

function go(page, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = el || document.querySelector(`[data-page="${page}"]`);
  if (target) target.classList.add('active');
  renderSection(page);
}

// ── Section router ────────────────────────────────────────────────

function renderSection(page) {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading">Yükleniyor...</div>';

  const map = {
    users:          renderUsers,
    rooms:          renderRooms,
    payments:       role === 'admin' ? renderAdminPayments : renderStudentPayments,
    announcements:  role === 'admin' ? renderAdminAnnouncements : renderStudentAnnouncements,
    requests:       renderAdminRequests,
    transfers:      role === 'admin' ? renderAdminTransfers : renderStudentTransfers,
    settings:       renderSettings,
    room:           renderStudentRoom,
    complaints:     renderStudentComplaints,
    'visitor-logs': renderVisitorLogs,
    'entry-logs':   renderEntryLogs,
    'cleaning-list':renderCleaningList,
    'maint-list':   renderMaintenanceList
  };

  const fn = map[page];
  if (fn) fn(main);
  else main.innerHTML = '<p style="color:var(--text-muted);padding:20px">Sayfa bulunamadı.</p>';
}

// ══════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════

const TYPE_LABELS = {
  complaint: 'Şikayet', maintenance: 'Bakım/Arıza',
  room_change: 'Oda Değişikliği', leave: 'İzin'
};

async function renderUsers(main) {
  main.innerHTML = `
    <h1 class="page-title">👥 Kullanıcı Yönetimi</h1>
    <div class="card">
      <table>
        <thead><tr><th>Ad Soyad</th><th>Kullanıcı Adı</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-users"><tr><td colspan="6" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>
  `;

  const data = await apiFetch('/admin/users');
  const list = data?.data || data?.users || [];
  const tbody = document.getElementById('tbl-users');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">Kullanıcı bulunamadı</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>${u.first_name || ''} ${u.last_name || ''}</td>
      <td>${u.username || '-'}</td>
      <td>${u.email || '-'}</td>
      <td><span class="status status-info">${u.user_type || '-'}</span></td>
      <td><span class="status ${u.is_active ? 'status-success' : 'status-danger'}">${u.is_active ? 'Aktif' : 'Pasif'}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <select id="role-sel-${u.id}" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:rgba(15,15,25,.6);color:var(--text);font-size:12px">
          <option value="Öğrenci"    ${u.user_type==='Öğrenci'    ?'selected':''}>Öğrenci</option>
          <option value="Yönetici"   ${u.user_type==='Yönetici'   ?'selected':''}>Yönetici</option>
          <option value="Güvenlik"   ${u.user_type==='Güvenlik'   ?'selected':''}>Güvenlik</option>
          <option value="Temizlik"   ${u.user_type==='Temizlik'   ?'selected':''}>Temizlik</option>
          <option value="Bakım"      ${u.user_type==='Bakım'      ?'selected':''}>Bakım</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="adminUpdateRole(${u.id}, this)">Rol Güncelle</button>
        <button class="btn btn-sm btn-primary" onclick="adminSendResetLink(${u.id}, this)">&#128274; Şifre Sıfırla</button>
      </td>
    </tr>
  `).join('');
}

async function adminUpdateRole(userId, btn) {
  const sel = document.getElementById('role-sel-' + userId);
  const user_type = sel?.value;
  if (!user_type) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';
  const res = await apiFetch('/admin/users/' + userId + '/role', {
    method: 'PATCH',
    body: JSON.stringify({ user_type })
  });
  btn.disabled = false;
  btn.textContent = original;
  showToast(res?.message || 'Bir hata oluştu');
}

async function adminSendResetLink(userId, btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';
  const res = await apiFetch('/auth/admin-reset-password', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  btn.disabled = false;
  btn.innerHTML = original;
  showToast(res?.message || 'Bir hata oluştu');
}

async function renderRooms(main) {
  main.innerHTML = `
    <h1 class="page-title">🏢 Oda Yönetimi</h1>
    <div class="card">
      <table>
        <thead><tr><th>Oda No</th><th>Bina</th><th>Kapasite</th><th>Dolu</th><th>Durum</th></tr></thead>
        <tbody id="tbl-rooms"><tr><td colspan="5" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>
  `;

  const data = await apiFetch('/rooms');
  const list = Array.isArray(data) ? data : (data?.rooms || []);
  const tbody = document.getElementById('tbl-rooms');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Oda bulunamadı</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.room_number}</td>
      <td>${r.building_name || '-'}</td>
      <td>${r.capacity}</td>
      <td>${r.current_occupancy || 0}</td>
      <td><span class="status ${statusClass(r.status)}">${r.status}</span></td>
    </tr>
  `).join('');
}

async function renderAdminPayments(main) {
  main.innerHTML = `
    <h1 class="page-title">💰 Ödeme Yönetimi</h1>

    <div class="stats-grid" id="pay-stats-row"></div>

    <div class="card">
      <div class="card-header">
        <h3>Ödeme Kayıtları</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="pay-filter-status" onchange="refreshAdminPayments()"
            style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(15,15,25,.6);color:var(--text);font-size:13px">
            <option value="">İTm Durumlar</option>
            <option value="Beklemede">Beklemede</option>
            <option value="Ödendi">Ödendi</option>
            <option value="Gecikmiş">Gecikmiş</option>
            <option value="İptal">İptal</option>
          </select>
          <input type="number" id="pay-filter-year" placeholder="Yıl" min="2020" max="2030"
            onchange="refreshAdminPayments()"
            style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(15,15,25,.6);color:var(--text);font-size:13px;width:80px">
          <button class="btn btn-primary" onclick="openModal('add-payment')">+ Ödeme Ekle</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Öğrenci</th><th>Oda</th><th>Tutar</th><th>Tür</th><th>Dönem</th><th>Vade</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-admin-pay"><tr><td colspan="8" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <!-- ADD PAYMENT MODAL -->
    <div class="modal-overlay" id="modal-add-payment">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('add-payment')">&times;</button>
        <h3>💰 Yeni Ödeme Kaydı</h3>
        <div class="form-group">
          <label>Öğrenci <span style="color:var(--danger)">*</span></label>
          <select id="pay-user-id"><option value="">— Yükleniyor... —</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label>Tutar (₺) <span style="color:var(--danger)">*</span></label>
            <input type="number" id="pay-amount" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Ödeme Türü</label>
            <select id="pay-type">
              <option value="Yurt Ücreti">Yurt Ücreti</option>
              <option value="Depozito">Depozito</option>
              <option value="Ceza">Ceza</option>
              <option value="Diğer">Diğer</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dönem Ay</label>
            <select id="pay-month">
              <option value="">—</option>
              ${months.slice(1).map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Dönem Yıl</label>
            <input type="number" id="pay-year" min="2020" max="2030" placeholder="${new Date().getFullYear()}">
          </div>
          <div class="form-group">
            <label>Vade Tarihi</label>
            <input type="date" id="pay-due">
          </div>
          <div class="form-group">
            <label>Ödeme Yöntemi</label>
            <select id="pay-method">
              <option value="Havale">Havale</option>
              <option value="Nakit">Nakit</option>
              <option value="Kredi Kartı">Kredi Kartı</option>
              <option value="EFT">EFT</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label>Notlar</label><textarea id="pay-notes" rows="2"></textarea></div>
        <button class="btn btn-primary" id="btn-add-pay" onclick="submitAddPayment()">Kaydet</button>
      </div>
    </div>

    <!-- UPDATE STATUS MODAL -->
    <div class="modal-overlay" id="modal-update-pay">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('update-pay')">&times;</button>
        <h3>💰 Ödeme Güncelle</h3>
        <div id="update-pay-info" style="background:rgba(99,102,241,0.07);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--text-muted);line-height:1.7"></div>
        <div class="form-group">
          <label>Durum</label>
          <select id="update-pay-status">
            <option value="Beklemede">Beklemede</option>
            <option value="Ödendi">Ödendi</option>
            <option value="Gecikmiş">Gecikmiş</option>
            <option value="İptal">İptal</option>
          </select>
        </div>
        <div class="form-group">
          <label>Ödeme Yöntemi</label>
          <select id="update-pay-method">
            <option value="">— Değiştirme —</option>
            <option value="Havale">Havale</option>
            <option value="Nakit">Nakit</option>
            <option value="Kredi Kartı">Kredi Kartı</option>
            <option value="EFT">EFT</option>
          </select>
        </div>
        <div class="form-group"><label>Notlar</label><textarea id="update-pay-notes" rows="2"></textarea></div>
        <input type="hidden" id="update-pay-id">
        <button class="btn btn-primary" onclick="submitUpdatePayment()">Güncelle</button>
      </div>
    </div>
  `;

  // Load students for dropdown
  apiFetch('/admin/users').then(users => {
    const list = Array.isArray(users) ? users : (users?.data || users?.users || []);
    const students = list.filter(u => u.user_type === 'Öğrenci');
    const sel = document.getElementById('pay-user-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Öğrenci Seçin —</option>' +
      students.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name} (${u.email})</option>`).join('');
  });

  await refreshAdminPayments();
  loadPayStats();
}

async function loadPayStats() {
  const data = await apiFetch('/payments/stats');
  const el = document.getElementById('pay-stats-row');
  if (!el || !data) return;
  const s = data.summary || data.stats || data;
  el.innerHTML = [
    { icon: '💵', value: Number(s.total_collected||0).toLocaleString('tr-TR')+' ₺', label: 'Tahsil Edildi', cls: 'status-success' },
    { icon: '⏳',      value: Number(s.total_pending||0).toLocaleString('tr-TR')+' ₺',  label: 'Bekleyen',       cls: 'status-warning' },
    { icon: '⚠️',     value: Number(s.total_overdue||0).toLocaleString('tr-TR')+' ₺', label: 'Gecikmiş',       cls: 'status-danger' },
    { icon: '🗂️',     value: s.total_records||0,                                 label: 'Toplam Kayıt',   cls: 'status-info' }
  ].map(c => `
    <div class="stat-card">
      <div class="icon">${c.icon}</div>
      <div class="value" style="font-size:18px">${c.value}</div>
      <div class="label">${c.label}</div>
    </div>
  `).join('');
}

async function refreshAdminPayments() {
  const status = document.getElementById('pay-filter-status')?.value || '';
  const year   = document.getElementById('pay-filter-year')?.value || '';
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (year)   qs.set('period_year', year);
  const url = '/payments' + (qs.toString() ? '?' + qs.toString() : '');

  const data = await apiFetch(url);
  const list = Array.isArray(data) ? data : (data?.data || []);
  const tbody = document.getElementById('tbl-admin-pay');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">Ödeme kaydı yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.first_name||''} ${p.last_name||''}<br><small style="color:var(--text-dim)">${p.student_number||p.email||''}</small></td>
      <td>${p.room_number ? `${p.room_number} (${p.building_name||''})` : '—'}</td>
      <td style="font-weight:600">${Number(p.amount||0).toLocaleString('tr-TR')} ₺</td>
      <td>${p.payment_type||'—'}</td>
      <td>${months[p.period_month]||''} ${p.period_year||'—'}</td>
      <td style="color:${p.due_date && new Date(p.due_date)<new Date() && p.status!=='Ödendi' ? 'var(--danger)' : 'inherit'}">${fmtDate(p.due_date)}</td>
      <td><span class="status ${statusClass(p.status)}">${p.status}</span></td>
      <td><button class="btn btn-sm btn-primary" onclick="openUpdatePayment(${p.id},'${p.status}','${(p.first_name||'')+' '+(p.last_name||'')}',${p.amount},'${months[p.period_month]||''} ${p.period_year||''}')">Güncelle</button></td>
    </tr>
  `).join('');
}

function openUpdatePayment(id, status, name, amount, period) {
  document.getElementById('update-pay-id').value = id;
  document.getElementById('update-pay-status').value = status;
  document.getElementById('update-pay-method').value = '';
  document.getElementById('update-pay-notes').value = '';
  document.getElementById('update-pay-info').innerHTML =
    `<strong>Öğrenci:</strong> ${name}<br><strong>Tutar:</strong> ${Number(amount).toLocaleString('tr-TR')} ₺<br><strong>Dönem:</strong> ${period}`;
  openModal('update-pay');
}

async function submitAddPayment() {
  const user_id      = document.getElementById('pay-user-id').value;
  const amount       = document.getElementById('pay-amount').value;
  const payment_type = document.getElementById('pay-type').value;
  const period_month = document.getElementById('pay-month').value || null;
  const period_year  = document.getElementById('pay-year').value || null;
  const due_date     = document.getElementById('pay-due').value || null;
  const payment_method = document.getElementById('pay-method').value;
  const notes        = document.getElementById('pay-notes').value.trim();
  const btn          = document.getElementById('btn-add-pay');

  if (!user_id || !amount) { showToast('Öğrenci ve tutar zorunlu'); return; }

  btn.disabled = true; btn.textContent = 'Kaydediliyor...';

  const res = await apiFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({ user_id: parseInt(user_id), amount: parseFloat(amount),
      payment_type, payment_method, period_month: period_month ? parseInt(period_month) : null,
      period_year: period_year ? parseInt(period_year) : null, due_date, notes: notes||null })
  });

  btn.disabled = false; btn.textContent = 'Kaydet';
  if (!res) return;
  if (res?.message) showToast(res.message);
  closeModal('add-payment');
  await refreshAdminPayments();
  loadPayStats();
}

async function submitUpdatePayment() {
  const id     = document.getElementById('update-pay-id').value;
  const status = document.getElementById('update-pay-status').value;
  const payment_method = document.getElementById('update-pay-method').value || undefined;
  const notes  = document.getElementById('update-pay-notes').value.trim() || undefined;

  const body = { status };
  if (payment_method) body.payment_method = payment_method;
  if (notes) body.notes = notes;

  const res = await apiFetch('/payments/' + id + '/pay', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  if (res?.message) showToast(res.message);
  closeModal('update-pay');
  await refreshAdminPayments();
  loadPayStats();
}

async function renderAdminRequests(main) {
  main.innerHTML = `
    <h1 class="page-title">📋 Tüm Talepler</h1>
    <div class="card">
      <div class="card-header">
        <h3>Talepler</h3>
        <select id="req-filter" onchange="filterAdminRequests()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(15,15,25,.6);color:var(--text);font-size:13px">
          <option value="">Tümü</option>
          <option value="complaint">Şikayet</option>
          <option value="maintenance">Bakım/Arıza</option>
          <option value="room_change">Oda Değişikliği</option>
          <option value="leave">İzin</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Öğrenci</th><th>Başlık</th><th>Tip</th><th>Kategori</th><th>Durum</th><th>Tarih</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-admin-req"><tr><td colspan="7" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-update-req">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('update-req')">&times;</button>
        <h3>📋 Talep Güncelle</h3>
        <div class="form-group">
          <label>Durum</label>
          <select id="req-status">
            <option>Beklemede</option><option>İnceleniyor</option>
            <option>Çözüldü</option><option>Reddedildi</option>
          </select>
        </div>
        <div class="form-group"><label>Yanıt</label><textarea id="req-response" rows="3"></textarea></div>
        <input type="hidden" id="req-id">
        <button class="btn btn-primary" onclick="submitRequestUpdate()">Güncelle</button>
      </div>
    </div>
  `;

  await refreshAdminRequests();
}

async function refreshAdminRequests(type) {
  const qs   = type ? `?type=${type}` : '';
  const data = await apiFetch('/complaints' + qs);
  const list = Array.isArray(data) ? data : (data?.data || []);
  const tbody = document.getElementById('tbl-admin-req');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">Talep yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.first_name || ''} ${c.last_name || ''}</td>
      <td>${c.title}</td>
      <td><span class="status status-info">${TYPE_LABELS[c.type] || 'Şikayet'}</span></td>
      <td>${c.category}</td>
      <td><span class="status ${statusClass(c.status)}">${c.status}</span></td>
      <td>${fmtDate(c.created_at)}</td>
      <td><button class="btn btn-sm btn-primary" onclick="openRequestUpdate(${c.id},'${c.status}')">Güncelle</button></td>
    </tr>
  `).join('');
}

function filterAdminRequests() {
  const type = document.getElementById('req-filter').value;
  refreshAdminRequests(type);
}

function openRequestUpdate(id, status) {
  document.getElementById('req-id').value = id;
  document.getElementById('req-status').value = status;
  document.getElementById('req-response').value = '';
  openModal('update-req');
}

async function submitRequestUpdate() {
  const id       = document.getElementById('req-id').value;
  const status   = document.getElementById('req-status').value;
  const response = document.getElementById('req-response').value;

  await apiFetch('/complaints/' + id + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status, response })
  });

  closeModal('update-req');
  showToast('Talep güncellendi');
  filterAdminRequests();
}

async function renderAdminAnnouncements(main) {
  main.innerHTML = `
    <h1 class="page-title">📢 Duyuru Yönetimi</h1>
    <div class="card">
      <div class="card-header">
        <h3>Tüm Duyurular</h3>
        <button class="btn btn-primary" onclick="openModal('add-ann')">+ Yeni Duyuru</button>
      </div>
      <table>
        <thead><tr><th>Başlık</th><th>Kategori</th><th>Tarih</th></tr></thead>
        <tbody id="tbl-ann"><tr><td colspan="3" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-add-ann">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('add-ann')">&times;</button>
        <h3>📢 Yeni Duyuru</h3>
        <div class="form-group"><label>Başlık</label><input type="text" id="ann-title"></div>
        <div class="form-group"><label>İçerik</label><textarea id="ann-content" rows="4"></textarea></div>
        <div class="form-group">
          <label>Kategori</label>
          <select id="ann-category">
            <option>Genel</option><option>Acil</option>
            <option>Bakım</option><option>Etkinlik</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="submitAnnouncement()">Yayınla</button>
      </div>
    </div>
  `;

  await refreshAnnouncementTable();
}

async function refreshAnnouncementTable() {
  const data = await apiFetch('/announcements');
  const list = Array.isArray(data) ? data : (data?.data || data?.announcements || []);
  const tbody = document.getElementById('tbl-ann');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="tbl-empty">Duyuru yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => `
    <tr>
      <td>
        <strong>${a.title}</strong>
        <div style="font-size:11px;color:var(--text-muted)">${(a.content || '').substring(0, 80)}${(a.content || '').length > 80 ? '...' : ''}</div>
      </td>
      <td><span class="status status-info">${a.category || 'Genel'}</span></td>
      <td>${fmtDate(a.created_at)}</td>
    </tr>
  `).join('');
}

async function submitAnnouncement() {
  const title    = document.getElementById('ann-title').value.trim();
  const content  = document.getElementById('ann-content').value.trim();
  const category = document.getElementById('ann-category').value;

  if (!title || !content) { showToast('Başlık ve içerik zorunlu'); return; }

  await apiFetch('/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, content, category })
  });

  closeModal('add-ann');
  showToast('Duyuru yayınlandı');
  await refreshAnnouncementTable();
}

// ══════════════════════════════════════════════════════════════════
// STUDENT
// ══════════════════════════════════════════════════════════════════

async function renderStudentRoom(main) {
  main.innerHTML = `
    <h1 class="page-title">🏠 Oda Bilgilerim</h1>
    <div id="room-info"><div class="loading">Yükleniyor...</div></div>
  `;

  const data = await apiFetch('/students/profile');
  const room = data?.data?.room || null;
  const el = document.getElementById('room-info');
  if (!el) return;

  if (!room) {
    el.innerHTML = '<div class="card"><p style="color:var(--text-muted)">Henüz bir oda ataması yapılmamış.</p></div>';
    return;
  }

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="icon">🏠</div><div class="value">${room.room_number || '-'}</div><div class="label">Oda Numarası</div></div>
      <div class="stat-card"><div class="icon">🏢</div><div class="value">${room.building_name || '-'}</div><div class="label">Bina</div></div>
      <div class="stat-card"><div class="icon">🔢</div><div class="value">${room.floor_number ?? '-'}</div><div class="label">Kat</div></div>
      <div class="stat-card"><div class="icon">👤</div><div class="value">${room.capacity || '-'}</div><div class="label">Kapasite</div></div>
    </div>
  `;
}

async function renderStudentPayments(main) {
  main.innerHTML = `
    <h1 class="page-title">💰 Ödeme Geçmişim</h1>
    <div class="stats-grid" id="my-pay-stats"></div>
    <div class="card">
      <div class="card-header">
        <h3>Ödeme Geçmişi</h3>
        <select id="my-pay-filter" onchange="filterStudentPayments()"
          style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(15,15,25,.6);color:var(--text);font-size:13px">
          <option value="">Tüm Durumlar</option>
          <option value="Beklemede">Beklemede</option>
          <option value="Ödendi">Ödendi</option>
          <option value="Gecikmiş">Gecikmiş</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Tür</th><th>Tutar</th><th>Dönem</th><th>Vade</th><th>Durum</th><th>Ödenme Tarihi</th></tr></thead>
        <tbody id="tbl-my-pay"><tr><td colspan="6" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>
  `;

  const data = await apiFetch('/payments/my');
  window._myPayments = Array.isArray(data) ? data : (data?.data || []);

  // Stats
  const stats = window._myPayments.reduce((acc, p) => {
    if (p.status === 'Ödendi')    { acc.paid += Number(p.amount||0); acc.paidCount++; }
    if (p.status === 'Beklemede') { acc.pending += Number(p.amount||0); acc.pendingCount++; }
    if (p.status === 'Gecikmiş')  { acc.overdue += Number(p.amount||0); acc.overdueCount++; }
    return acc;
  }, { paid:0, paidCount:0, pending:0, pendingCount:0, overdue:0, overdueCount:0 });

  const statsEl = document.getElementById('my-pay-stats');
  if (statsEl) statsEl.innerHTML = [
    { icon: '✅', value: stats.paidCount,    label: 'Ödendi',   sub: Number(stats.paid).toLocaleString('tr-TR')+' ₺',   cls: 'status-success' },
    { icon: '⏳', value: stats.pendingCount, label: 'Bekliyor', sub: Number(stats.pending).toLocaleString('tr-TR')+' ₺', cls: 'status-warning' },
    { icon: '⚠️', value: stats.overdueCount, label: 'Gecikmiş', sub: Number(stats.overdue).toLocaleString('tr-TR')+' ₺', cls: 'status-danger' }
  ].map(c => `
    <div class="stat-card">
      <div class="icon">${c.icon}</div>
      <div class="value">${c.value}</div>
      <div class="label">${c.label}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${c.sub}</div>
    </div>`).join('');

  filterStudentPayments();
}

function filterStudentPayments() {
  const filter = document.getElementById('my-pay-filter')?.value || '';
  const list = (window._myPayments || []).filter(p => !filter || p.status === filter);
  const tbody = document.getElementById('tbl-my-pay');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">Ödeme kaydı yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => {
    const overdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'Ödendi';
    return `
    <tr>
      <td>${p.payment_type || 'Yurt Ücreti'}</td>
      <td style="font-weight:600">${Number(p.amount||0).toLocaleString('tr-TR')} ₺</td>
      <td>${months[p.period_month]||''} ${p.period_year||'—'}</td>
      <td style="color:${overdue ? 'var(--danger)' : 'inherit'}">${fmtDate(p.due_date)}${overdue ? ' ⚠️' : ''}</td>
      <td><span class="status ${statusClass(p.status)}">${p.status}</span></td>
      <td>${p.paid_at ? fmtDate(p.paid_at) : '—'}</td>
    </tr>`;
  }).join('');
}

async function renderStudentAnnouncements(main) {
  main.innerHTML = `
    <h1 class="page-title">📢 Duyurular</h1>
    <div id="ann-list"><div class="loading">Yükleniyor...</div></div>
  `;

  const data = await apiFetch('/announcements');
  const list = Array.isArray(data) ? data : (data?.data || data?.announcements || []);
  const el = document.getElementById('ann-list');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = '<div class="card"><p style="color:var(--text-muted)">Duyuru yok.</p></div>';
    return;
  }

  el.innerHTML = list.map(a => `
    <div class="card ann-card">
      <div class="ann-header">
        <strong>${a.title}</strong>
        <span class="status status-info">${a.category || 'Genel'}</span>
      </div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:8px">${a.content || ''}</p>
      <div style="font-size:11px;color:var(--text-dim);margin-top:8px">${fmtDate(a.created_at)}</div>
    </div>
  `).join('');
}

async function renderStudentComplaints(main) {
  main.innerHTML = `
    <h1 class="page-title">📝 Taleplerim</h1>
    <div class="card">
      <div class="card-header">
        <h3>Taleplerim</h3>
        <button class="btn btn-primary" onclick="openModal('new-complaint')">+ Yeni Talep</button>
      </div>
      <table>
        <thead><tr><th>Başlık</th><th>Tip</th><th>Kategori</th><th>Durum</th><th>Tarih</th></tr></thead>
        <tbody id="tbl-complaints"><tr><td colspan="5" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-new-complaint">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('new-complaint')">&times;</button>
        <h3>📝 Yeni Talep</h3>
        <div class="form-group">
          <label>Talep Tipi</label>
          <select id="comp-type">
            <option value="complaint">Şikayet</option>
            <option value="maintenance">Bakım / Arıza</option>
            <option value="room_change">Oda Değişikliği</option>
            <option value="leave">İzin Talebi</option>
          </select>
        </div>
        <div class="form-group"><label>Başlık</label><input type="text" id="comp-title"></div>
        <div class="form-group">
          <label>Kategori</label>
          <select id="comp-category">
            <option value="Şikayet">Şikayet</option>
            <option value="Arıza">Arıza</option>
            <option value="Temizlik">Temizlik</option>
            <option value="Güvenlik">Güvenlik</option>
            <option value="Öneri">Öneri</option>
            <option value="Diğer">Diğer</option>
          </select>
        </div>
        <div class="form-group"><label>Açıklama</label><textarea id="comp-desc" rows="4"></textarea></div>
        <button class="btn btn-primary" onclick="submitComplaint()">Gönder</button>
      </div>
    </div>
  `;

  await refreshComplaintsTable();
}

async function refreshComplaintsTable() {
  const data = await apiFetch('/complaints/my');
  const list = Array.isArray(data) ? data : (data?.data || []);
  const tbody = document.getElementById('tbl-complaints');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Talep yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.title || '-'}</td>
      <td><span class="status status-info">${TYPE_LABELS[c.type] || 'Şikayet'}</span></td>
      <td>${c.category || '-'}</td>
      <td><span class="status ${statusClass(c.status || '')}">${c.status || '-'}</span></td>
      <td>${fmtDate(c.created_at)}</td>
    </tr>
  `).join('');
}

async function submitComplaint() {
  const type        = document.getElementById('comp-type').value;
  const title       = document.getElementById('comp-title').value.trim();
  const category    = document.getElementById('comp-category').value;
  const description = document.getElementById('comp-desc').value.trim();

  if (!type)        { showToast('Talep tipi seçin'); return; }
  if (!title)       { showToast('Başlık zorunlu'); return; }
  if (!description) { showToast('Açıklama zorunlu'); return; }

  const result = await apiFetch('/complaints', {
    method: 'POST',
    body: JSON.stringify({ type, title, category, description })
  });

  if (!result) return;

  closeModal('new-complaint');
  showToast('Talebiniz iletildi');
  await refreshComplaintsTable();
}

// ══════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════

async function renderVisitorLogs(main) {
  main.innerHTML = `
    <h1 class="page-title">👤 Ziyaretçi Kayıtları</h1>
    <div class="card">
      <div class="card-header">
        <h3>Ziyaretçiler</h3>
        <button class="btn btn-primary" onclick="openModal('new-visitor')">+ Ziyaretçi Ekle</button>
      </div>
      <table>
        <thead><tr><th>Ad Soyad</th><th>TC Kimlik</th><th>Ziyaret Edilen</th><th>Giriş</th><th>Çıkış</th></tr></thead>
        <tbody id="tbl-visitors"><tr><td colspan="5" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-new-visitor">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('new-visitor')">&times;</button>
        <h3>👤 Ziyaretçi Kaydı</h3>
        <div class="form-group"><label>Ad Soyad</label><input type="text" id="vis-name"></div>
        <div class="form-group"><label>TC Kimlik No</label><input type="text" id="vis-tc" maxlength="11"></div>
        <div class="form-group"><label>Telefon</label><input type="text" id="vis-phone"></div>
        <div class="form-group"><label>Ziyaret Edilen Öğrenci</label><input type="text" id="vis-host"></div>
        <button class="btn btn-primary" onclick="submitVisitor()">Kaydet</button>
      </div>
    </div>
  `;

  const data = await apiFetch('/visitors');
  const list = Array.isArray(data) ? data : (data?.data || data?.visitors || []);
  const tbody = document.getElementById('tbl-visitors');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Ziyaretçi kaydı yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr>
      <td>${v.visitor_name || '-'}</td>
      <td>${v.visitor_tc || '-'}</td>
      <td>${(v.student_first || '') + ' ' + (v.student_last || '') || '-'}</td>
      <td>${fmtDate(v.check_in_time)}</td>
      <td>${v.check_out_time ? fmtDate(v.check_out_time) : '<span class="status status-warning">İçeride</span>'}</td>
    </tr>
  `).join('');
}

async function submitVisitor() {
  const name  = document.getElementById('vis-name').value.trim();
  const tc    = document.getElementById('vis-tc').value.trim();
  const phone = document.getElementById('vis-phone').value.trim();
  const host  = document.getElementById('vis-host').value.trim();

  if (!name || !tc) { showToast('Ad ve TC zorunlu'); return; }

  const result = await apiFetch('/visitors', {
    method: 'POST',
    body: JSON.stringify({ visitor_name: name, visitor_tc: tc, visitor_phone: phone, host_name: host })
  });
  if (!result) return;

  closeModal('new-visitor');
  showToast('Ziyaretçi kaydedildi');
  renderSection('visitor-logs');
}

async function renderEntryLogs(main) {
  main.innerHTML = `
    <h1 class="page-title">📋 Giriş-Çıkış Kayıtları</h1>
    <div class="card">
      <table>
        <thead><tr><th>Öğrenci</th><th>İşlem</th><th>Kapı</th><th>Zaman</th></tr></thead>
        <tbody id="tbl-entry"><tr><td colspan="4" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>
  `;

  const data = await apiFetch('/entry-exit');
  const list = Array.isArray(data) ? data : (data?.data || data?.logs || []);
  const tbody = document.getElementById('tbl-entry');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">Kayıt yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr>
      <td>${l.first_name || ''} ${l.last_name || ''}</td>
      <td><span class="status ${l.log_type === 'Giriş' ? 'status-success' : 'status-danger'}">${l.log_type}</span></td>
      <td>${l.gate || '-'}</td>
      <td>${fmtDate(l.logged_at)}</td>
    </tr>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════
// CLEANING
// ══════════════════════════════════════════════════════════════════

async function renderCleaningList(main) {
  main.innerHTML = `
    <h1 class="page-title">🧹 Temizlik Listesi</h1>
    <div class="card">
      <table>
        <thead><tr><th>Oda No</th><th>Bina</th><th>Kat</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-clean"><tr><td colspan="5" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>
  `;

  const data = await apiFetch('/rooms');
  const list = (Array.isArray(data) ? data : (data?.rooms || [])).filter(r => r.status !== 'Bakımda');
  const tbody = document.getElementById('tbl-clean');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Oda bulunamadı</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.room_number}</td>
      <td>${r.building_name || '-'}</td>
      <td>${r.floor_number ?? '-'}</td>
      <td><span class="status ${statusClass(r.cleaning_status || 'Bekliyor')}">${r.cleaning_status || 'Bekliyor'}</span></td>
      <td>
        <button class="btn btn-sm btn-success" onclick="markCleaned(${r.id}, '${r.room_number}')">
          ✓ Temizlendi
        </button>
      </td>
    </tr>
  `).join('');
}

async function markCleaned(id, roomNumber) {
  await apiFetch('/rooms/' + id + '/cleaning', {
    method: 'PATCH',
    body: JSON.stringify({ cleaning_status: 'Temizlendi' })
  });
  showToast(`Oda ${roomNumber} temizlendi olarak işaretlendi`);
  renderSection('cleaning-list');
}

// ══════════════════════════════════════════════════════════════════
// MAINTENANCE
// ══════════════════════════════════════════════════════════════════

async function renderMaintenanceList(main) {
  main.innerHTML = `
    <h1 class="page-title">🔧 Bakım Talepleri</h1>
    <div class="card">
      <table>
        <thead><tr><th>Öğrenci</th><th>Başlık</th><th>Oda</th><th>Durum</th><th>Tarih</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-maint"><tr><td colspan="6" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-update-maint">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('update-maint')">&times;</button>
        <h3>🔧 Talep Güncelle</h3>
        <div class="form-group">
          <label>Durum</label>
          <select id="maint-status">
            <option>Beklemede</option><option>İnceleniyor</option>
            <option>Çözüldü</option><option>Reddedildi</option>
          </select>
        </div>
        <div class="form-group"><label>Yanıt</label><textarea id="maint-response" rows="3"></textarea></div>
        <input type="hidden" id="maint-req-id">
        <button class="btn btn-primary" onclick="submitMaintenanceUpdate()">Güncelle</button>
      </div>
    </div>
  `;

  await refreshMaintenanceTable();
}

async function refreshMaintenanceTable() {
  const data = await apiFetch('/complaints');
  const list = Array.isArray(data) ? data : (data?.data || []);
  const tbody = document.getElementById('tbl-maint');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">Bakım talebi yok</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(m => `
    <tr>
      <td>${m.first_name || ''} ${m.last_name || ''}</td>
      <td>${m.title || '-'}</td>
      <td>${m.room_number || '-'}</td>
      <td><span class="status ${statusClass(m.status || '')}">${m.status || '-'}</span></td>
      <td>${fmtDate(m.created_at)}</td>
      <td>
        ${m.status !== 'Çözüldü' ? `
          <button class="btn btn-sm btn-primary" onclick="openMaintenanceUpdate(${m.id},'${m.status}')">Güncelle</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function openMaintenanceUpdate(id, status) {
  document.getElementById('maint-req-id').value = id;
  document.getElementById('maint-status').value = status;
  document.getElementById('maint-response').value = '';
  openModal('update-maint');
}

async function submitMaintenanceUpdate() {
  const id       = document.getElementById('maint-req-id').value;
  const status   = document.getElementById('maint-status').value;
  const response = document.getElementById('maint-response').value;

  await apiFetch('/complaints/' + id + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status, response })
  });

  closeModal('update-maint');
  showToast('Talep güncellendi');
  await refreshMaintenanceTable();
}

// ══════════════════════════════════════════════════════════════════
// ROOM TRANSFER REQUESTS — STUDENT
// ══════════════════════════════════════════════════════════════════

async function renderStudentTransfers(main) {
  main.innerHTML = `
    <h1 class="page-title">🔄 Oda Değişikliği Taleplerim</h1>
    <div class="card">
      <div class="card-header">
        <h3>Taleplerim</h3>
        <button class="btn btn-primary" onclick="openTransferModal()">+ Yeni Talep</button>
      </div>
      <table>
        <thead><tr><th>Mevcut Oda</th><th>Talep Edilen Oda</th><th>Gerekçe</th><th>Öncelik</th><th>Durum</th><th>Tarih</th></tr></thead>
        <tbody id="tbl-my-transfers"><tr><td colspan="6" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-new-transfer">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('new-transfer')">&times;</button>
        <h3>🔄 Oda Değişikliği Talebi</h3>
        <div class="form-group">
          <label>Mevcut Odanız</label>
          <input type="text" id="tr-current-room" class="form-control" readonly
                 style="opacity:0.6;cursor:not-allowed" placeholder="Yükleniyor...">
          <input type="hidden" id="tr-current-room-id">
        </div>
        <div class="form-group">
          <label>Talep Edilen Oda</label>
          <select id="tr-requested-room">
            <option value="">— Belirli oda seçin (opsiyonel) —</option>
          </select>
        </div>
        <div class="form-group">
          <label>Öncelik</label>
          <select id="tr-priority">
            <option value="Düşük">Düşük</option>
            <option value="Orta" selected>Orta</option>
            <option value="Yüksek">Yüksek</option>
            <option value="Acil">Acil</option>
          </select>
        </div>
        <div class="form-group">
          <label>Gerekçe <span style="color:var(--danger)">*</span></label>
          <textarea id="tr-reason" rows="4" placeholder="Oda değişikliği talebinizin gerekçesini açıklayın..."></textarea>
        </div>
        <button class="btn btn-primary" id="btn-submit-transfer" onclick="submitTransferRequest()">Talebi Gönder</button>
      </div>
    </div>
  `;

  await refreshStudentTransfers();
}

async function openTransferModal() {
  document.getElementById('tr-reason').value = '';
  document.getElementById('tr-priority').value = 'Orta';
  document.getElementById('tr-requested-room').innerHTML = '<option value="">— Yükleniyor... —</option>';
  document.getElementById('tr-current-room').value = 'Yükleniyor...';
  document.getElementById('btn-submit-transfer').disabled = false;
  openModal('new-transfer');

  // Load current room info and available rooms in parallel
  const [profile, rooms] = await Promise.all([
    apiFetch('/students/dashboard'),
    apiFetch('/rooms')
  ]);

  const room = profile?.room;
  if (room) {
    document.getElementById('tr-current-room').value =
      `${room.room_number} — ${room.building_name || ''} (Kat ${room.floor_number ?? '-'})`;
    document.getElementById('tr-current-room-id').value = room.room_id || '';
  } else {
    document.getElementById('tr-current-room').value = 'Oda atamanız bulunmuyor';
  }

  const roomList = Array.isArray(rooms) ? rooms : (rooms?.rooms || []);
  const currentRoomId = room?.room_id;
  const available = roomList.filter(r =>
    r.id !== currentRoomId &&
    r.status !== 'Bakımda' &&
    (!r.capacity || r.current_occupancy < r.capacity)
  );

  const sel = document.getElementById('tr-requested-room');
  sel.innerHTML = '<option value="">— Belirli oda seçin (opsiyonel) —</option>' +
    available.map(r =>
      `<option value="${r.id}">${r.room_number} — ${r.building_name || r.building_id || ''} (Kat ${r.floor_number ?? '-'}, ${r.current_occupancy}/${r.capacity})</option>`
    ).join('');
}

async function refreshStudentTransfers() {
  const data = await apiFetch('/students/transfer-requests');
  const list = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('tbl-my-transfers');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">Henüz talep oluşturmadınız</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td>${t.current_room_number ? `${t.current_room_number} (${t.current_building || ''})` : '—'}</td>
      <td>${t.requested_room_number ? `${t.requested_room_number} (${t.requested_building || ''})` : '—'}</td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.reason}">${t.reason}</td>
      <td>${t.priority || '—'}</td>
      <td><span class="status ${statusClass(t.status)}">${t.status}</span></td>
      <td>${fmtDate(t.created_at)}</td>
    </tr>
  `).join('');
}

async function submitTransferRequest() {
  const reason          = document.getElementById('tr-reason').value.trim();
  const requested_room_id = document.getElementById('tr-requested-room').value || null;
  const priority        = document.getElementById('tr-priority').value;
  const btn             = document.getElementById('btn-submit-transfer');

  if (!reason) { showToast('Gerekçe zorunludur'); return; }

  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';

  const res = await apiFetch('/students/transfer-request', {
    method: 'POST',
    body: JSON.stringify({
      requested_room_id: requested_room_id ? parseInt(requested_room_id) : null,
      reason,
      priority
    })
  });

  btn.disabled = false;
  btn.textContent = 'Talebi Gönder';

  if (res?.message) showToast(res.message);
  closeModal('new-transfer');
  await refreshStudentTransfers();
}

// ══════════════════════════════════════════════════════════════════
// ROOM TRANSFER REQUESTS — ADMIN
// ══════════════════════════════════════════════════════════════════

async function renderAdminTransfers(main) {
  main.innerHTML = `
    <h1 class="page-title">🔄 Oda Transfer Talepleri</h1>
    <div class="card">
      <div class="card-header">
        <h3>Talepler</h3>
        <select id="transfer-filter" onchange="refreshAdminTransfers()"
                style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(15,15,25,.6);color:var(--text);font-size:13px">
          <option value="">Tümü</option>
          <option value="Beklemede">Beklemede</option>
          <option value="Onaylandı">Onaylandı</option>
          <option value="Tamamlandı">Tamamlandı</option>
          <option value="Reddedildi">Reddedildi</option>
          <option value="İptal">İptal</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Öğrenci</th><th>Mevcut Oda</th><th>Talep Edilen Oda</th><th>Öncelik</th><th>Gerekçe</th><th>Durum</th><th>Tarih</th><th>İşlem</th></tr></thead>
        <tbody id="tbl-admin-transfers"><tr><td colspan="8" class="tbl-empty">Yükleniyor...</td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-transfer-action">
      <div class="modal">
        <button class="modal-close" onclick="closeModal('transfer-action')">&times;</button>
        <h3 id="transfer-action-title">Transfer Talebi</h3>
        <div id="transfer-action-info" style="background:rgba(99,102,241,0.07);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--text-muted);line-height:1.7"></div>
        <div class="form-group">
          <label>İşlem</label>
          <select id="transfer-action-status">
            <option value="Onaylandı">Onayla</option>
            <option value="Reddedildi">Reddet</option>
          </select>
        </div>
        <div class="form-group" id="reject-reason-group" style="display:none">
          <label>Red Gerekçesi</label>
          <textarea id="transfer-reject-reason" rows="3" placeholder="Reddetme gerekçesini girin..."></textarea>
        </div>
        <div class="form-group">
          <label>Notlar (opsiyonel)</label>
          <textarea id="transfer-notes" rows="2"></textarea>
        </div>
        <input type="hidden" id="transfer-action-id">
        <button class="btn btn-primary" onclick="submitTransferAction()">Uygula</button>
      </div>
    </div>
  `;

  document.getElementById('transfer-action-status').addEventListener('change', function() {
    document.getElementById('reject-reason-group').style.display =
      this.value === 'Reddedildi' ? 'block' : 'none';
  });

  await refreshAdminTransfers();
}

async function refreshAdminTransfers() {
  const statusFilter = document.getElementById('transfer-filter')?.value || '';
  const data = await apiFetch('/students/transfer-requests');
  let list = Array.isArray(data) ? data : [];
  if (statusFilter) list = list.filter(t => t.status === statusFilter);

  const tbody = document.getElementById('tbl-admin-transfers');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">Talep bulunamadı</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td>${t.first_name || ''} ${t.last_name || ''}<br><small style="color:var(--text-dim)">${t.email || ''}</small></td>
      <td>${t.current_room_number ? `${t.current_room_number}<br><small>${t.current_building || ''}</small>` : '—'}</td>
      <td>${t.requested_room_number ? `${t.requested_room_number}<br><small>${t.requested_building || ''}</small>` : '<span style="color:var(--text-dim)">Herhangi</span>'}</td>
      <td><span class="status ${t.priority === 'Acil' ? 'status-danger' : t.priority === 'Yüksek' ? 'status-warning' : 'status-info'}">${t.priority || '—'}</span></td>
      <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.reason}">${t.reason}</td>
      <td><span class="status ${statusClass(t.status)}">${t.status}</span></td>
      <td>${fmtDate(t.created_at)}</td>
      <td>${t.status === 'Beklemede' ? `<button class="btn btn-sm btn-primary" onclick="openTransferAction(${t.id},'${((t.first_name||'') + ' ' + (t.last_name||'')).replace(/'/g,"\\'")  }','${(t.current_room_number||'—')}','${(t.requested_room_number||'—')}','${(t.reason||'').replace(/'/g,"\\'").replace(/`/g,"'")}')">İşlem</button>` : '—'}</td>
    </tr>
  `).join('');
}

function openTransferAction(id, studentName, currentRoom, requestedRoom, reason) {
  document.getElementById('transfer-action-id').value = id;
  document.getElementById('transfer-action-title').textContent = `Transfer Talebi #${id}`;
  document.getElementById('transfer-action-info').innerHTML =
    `<strong>Öğrenci:</strong> ${studentName}<br>` +
    `<strong>Mevcut Oda:</strong> ${currentRoom}<br>` +
    `<strong>Talep Edilen:</strong> ${requestedRoom}<br>` +
    `<strong>Gerekçe:</strong> ${reason}`;
  document.getElementById('transfer-action-status').value = 'Onaylandı';
  document.getElementById('reject-reason-group').style.display = 'none';
  document.getElementById('transfer-reject-reason').value = '';
  document.getElementById('transfer-notes').value = '';
  openModal('transfer-action');
}

async function submitTransferAction() {
  const id              = document.getElementById('transfer-action-id').value;
  const status          = document.getElementById('transfer-action-status').value;
  const rejection_reason = document.getElementById('transfer-reject-reason').value.trim();
  const notes           = document.getElementById('transfer-notes').value.trim();

  if (status === 'Reddedildi' && !rejection_reason) {
    showToast('Red gerekçesi zorunludur');
    return;
  }

  const res = await apiFetch('/students/transfer-requests/' + id, {
    method: 'PATCH',
    body: JSON.stringify({ status, rejection_reason: rejection_reason || null, notes: notes || null })
  });

  if (res?.message) showToast(res.message);
  closeModal('transfer-action');
  await refreshAdminTransfers();
}

// ══════════════════════════════════════════════════════════════════
// SHARED: SETTINGS
// ══════════════════════════════════════════════════════════════════

function renderSettings(main) {
  main.innerHTML = `
    <h1 class="page-title">⚙️ Ayarlar</h1>
    <div class="card" style="max-width:400px">
      <h3 style="margin-bottom:16px">Şifre Değiştir</h3>
      <div class="form-group"><label>Mevcut Şifre</label><input type="password" id="old-pass"></div>
      <div class="form-group"><label>Yeni Şifre</label><input type="password" id="new-pass"></div>
      <button class="btn btn-primary" onclick="changePassword()">Güncelle</button>
    </div>
  `;
}

async function changePassword() {
  const oldPass = document.getElementById('old-pass').value;
  const newPass = document.getElementById('new-pass').value;

  if (!oldPass || !newPass) { showToast('Tüm alanları doldurun'); return; }

  const res = await apiFetch('/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: oldPass, newPassword: newPass })
  });

  showToast(res?.message || 'Şifre güncellendi');
  document.getElementById('old-pass').value = '';
  document.getElementById('new-pass').value = '';
}

// ── Logout ────────────────────────────────────────────────────────

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user_type');
  window.location.href = 'index.html';
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  _updateThemeBtn(next);
}
function _updateThemeBtn(t) {
  const icon = document.getElementById('themeIcon');
  const lbl  = document.getElementById('themeLabel');
  if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
  if (lbl)  lbl.textContent  = t === 'dark' ? 'Açık Tema' : 'Koyu Tema';
}

// ── Init ──────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  const user = await apiFetch('/profile');
  renderSidebar(user || {});
  renderSection(NAV[role][0].id);
  _updateThemeBtn(document.documentElement.getAttribute('data-theme') || 'light');
});
