/* ============================================================
   ADMIN DASHBOARD · admin.js
   ============================================================ */

'use strict';

const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

const state = {
  config:        null,
  registrations: [],
  whitelist:     [],
  regChannel:    null,
};

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, type = '') {
  const el = $('admin-toast');
  el.textContent = msg;
  el.className = 'admin-toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Auth ──────────────────────────────────────────────────────
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  const btn      = $('login-btn');
  const errEl    = $('login-error');

  errEl.classList.add('hidden');
  $('login-btn-label').classList.add('hidden');
  $('login-spinner').classList.remove('hidden');
  btn.disabled = true;

  const { error } = await db.auth.signInWithPassword({ email, password });

  $('login-btn-label').classList.remove('hidden');
  $('login-spinner').classList.add('hidden');
  btn.disabled = false;

  if (error) {
    errEl.textContent = 'Login failed: ' + error.message;
    errEl.classList.remove('hidden');
  }
  // onAuthStateChange จะจัดการเปลี่ยนหน้าเอง
});

$('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut();
});

db.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showDashboard(session);
  } else {
    showLogin();
  }
});

function showLogin() {
  $('admin-login').classList.remove('hidden');
  $('admin-dashboard').classList.add('hidden');
  if (state.regChannel) {
    db.removeChannel(state.regChannel);
    state.regChannel = null;
  }
}

async function showDashboard(session) {
  $('admin-login').classList.add('hidden');
  $('admin-dashboard').classList.remove('hidden');
  $('admin-user-email').textContent = session.user.email;
  $('login-form').reset();

  await Promise.all([loadConfig(), loadWhitelist(), loadRegistrations()]);
  subscribeRealtime();
}

// ── Config ────────────────────────────────────────────────────
async function loadConfig() {
  const { data, error } = await db.from('event_config').select('*').eq('id', 1).single();
  if (error) { toast('โหลด config ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.config = data;
  $('cfg-title1').value   = data.event_title_line1 || '';
  $('cfg-title2').value   = data.event_title_line2 || '';
  $('cfg-year').value     = data.event_year || '';
  $('cfg-location').value = data.event_location || '';
  $('cfg-date').value     = data.event_date || '';
  $('cfg-open').checked      = !!data.registration_open;
  $('cfg-whitelist').checked = !!data.whitelist_enabled;

  $('header-event-name').textContent =
    `${data.event_title_line1} ${data.event_title_line2} ${data.event_year}`;

  updateStats();
}

$('save-config-btn').addEventListener('click', async () => {
  const btn = $('save-config-btn');
  $('save-config-label').classList.add('hidden');
  $('save-config-spinner').classList.remove('hidden');
  btn.disabled = true;

  const payload = {
    event_title_line1: $('cfg-title1').value.trim(),
    event_title_line2: $('cfg-title2').value.trim(),
    event_year:        $('cfg-year').value.trim(),
    event_location:    $('cfg-location').value.trim(),
    event_date:        $('cfg-date').value.trim(),
    registration_open: $('cfg-open').checked,
    whitelist_enabled: $('cfg-whitelist').checked,
  };

  const { error } = await db.from('event_config').update(payload).eq('id', 1);

  $('save-config-label').classList.remove('hidden');
  $('save-config-spinner').classList.add('hidden');
  btn.disabled = false;

  if (error) {
    toast('บันทึกไม่สำเร็จ: ' + error.message, 'error');
  } else {
    state.config = { ...state.config, ...payload };
    $('header-event-name').textContent =
      `${payload.event_title_line1} ${payload.event_title_line2} ${payload.event_year}`;
    updateStats();
    toast('บันทึก config แล้ว', 'success');
  }
});

// ── Whitelist ─────────────────────────────────────────────────
async function loadWhitelist() {
  const { data, error } = await db
    .from('employees')
    .select('*')
    .order('employee_id', { ascending: true });

  if (error) { toast('โหลด whitelist ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.whitelist = data || [];
  renderWhitelist();
  updateStats();
}

function renderWhitelist() {
  const tbody = $('wl-tbody');
  const empty = $('wl-empty');
  $('wl-count').textContent = state.whitelist.length;

  tbody.innerHTML = '';
  empty.classList.toggle('hidden', state.whitelist.length > 0);

  state.whitelist.forEach((emp) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-mono">${escapeHtml(emp.employee_id)}</td>
      <td>${escapeHtml(emp.name || '—')}</td>
      <td>${escapeHtml(emp.department || '—')}</td>
      <td><button class="admin-btn admin-btn-danger" data-id="${escapeHtml(emp.employee_id)}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => deleteEmployee(emp.employee_id));
    tbody.appendChild(tr);
  });
}

$('wl-add-btn').addEventListener('click', async () => {
  const id   = $('wl-id').value.trim().toUpperCase();
  const name = $('wl-name').value.trim();
  const dept = $('wl-dept').value.trim();

  if (id.length < 3) { toast('Employee ID ต้องมีอย่างน้อย 3 ตัวอักษร', 'error'); return; }

  const { error } = await db.from('employees').insert({
    employee_id: id,
    name: name || null,
    department: dept || null,
  });

  if (error) {
    toast(error.code === '23505' ? 'มี ID นี้อยู่แล้ว' : 'เพิ่มไม่สำเร็จ: ' + error.message, 'error');
    return;
  }

  $('wl-id').value = ''; $('wl-name').value = ''; $('wl-dept').value = '';
  await loadWhitelist();
  toast('เพิ่มรายชื่อแล้ว', 'success');
});

$('wl-import-btn').addEventListener('click', async () => {
  const raw = $('wl-bulk').value.trim();
  if (!raw) { toast('กรุณาวางรายชื่อก่อน', 'error'); return; }

  const rows = raw.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [id, name, dept] = line.split(',').map(s => (s || '').trim());
      return { employee_id: (id || '').toUpperCase(), name: name || null, department: dept || null };
    })
    .filter(r => r.employee_id.length >= 3);

  if (!rows.length) { toast('ไม่พบรายชื่อที่ถูกต้อง', 'error'); return; }

  const { error } = await db.from('employees').upsert(rows, { onConflict: 'employee_id' });

  if (error) { toast('Import ไม่สำเร็จ: ' + error.message, 'error'); return; }

  $('wl-bulk').value = '';
  await loadWhitelist();
  toast(`Import ${rows.length} รายชื่อแล้ว`, 'success');
});

async function deleteEmployee(id) {
  if (!confirm(`ลบ ${id} ออกจาก whitelist?`)) return;
  const { error } = await db.from('employees').delete().eq('employee_id', id);
  if (error) { toast('ลบไม่สำเร็จ: ' + error.message, 'error'); return; }
  await loadWhitelist();
  toast('ลบแล้ว', 'success');
}

// ── Registrations ─────────────────────────────────────────────
async function loadRegistrations() {
  const { data, error } = await db
    .from('registrations')
    .select('*')
    .order('registered_at', { ascending: false });

  if (error) { toast('โหลด registrations ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.registrations = data || [];
  renderRegistrations();
  updateStats();
}

function renderRegistrations() {
  const tbody  = $('reg-tbody');
  const empty  = $('reg-empty');
  const filter = $('reg-search').value.trim().toUpperCase();

  const list = filter
    ? state.registrations.filter(r => r.employee_id.toUpperCase().includes(filter))
    : state.registrations;

  $('reg-count').textContent = state.registrations.length;

  tbody.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);
  if (list.length === 0 && filter) empty.textContent = 'ไม่พบผลการค้นหา';
  else empty.textContent = 'ยังไม่มีการลงทะเบียน';

  list.forEach((reg, i) => {
    const dt = new Date(reg.registered_at);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="col-mono">${escapeHtml(reg.employee_id)}</td>
      <td>${formatDateTime(dt)}</td>
      <td><button class="admin-btn admin-btn-danger" data-id="${escapeHtml(reg.employee_id)}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => deleteRegistration(reg.employee_id));
    tbody.appendChild(tr);
  });
}

$('reg-search').addEventListener('input', renderRegistrations);

async function deleteRegistration(id) {
  if (!confirm(`ลบการลงทะเบียนของ ${id}?`)) return;
  const { error } = await db.from('registrations').delete().eq('employee_id', id);
  if (error) { toast('ลบไม่สำเร็จ: ' + error.message, 'error'); return; }
  await loadRegistrations();
  toast('ลบแล้ว', 'success');
}

// ── Export CSV ────────────────────────────────────────────────
$('export-btn').addEventListener('click', () => {
  if (!state.registrations.length) { toast('ยังไม่มีข้อมูลให้ export', 'error'); return; }

  const header = ['No', 'Employee ID', 'Registered At'];
  const lines = state.registrations.map((r, i) =>
    [i + 1, r.employee_id, new Date(r.registered_at).toISOString()]
      .map(csvCell).join(',')
  );
  const csv = '﻿' + [header.join(','), ...lines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const name = (state.config?.event_title_line1 || 'event').replace(/\s+/g, '_');
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `registrations_${name}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export CSV แล้ว', 'success');
});

function csvCell(val) {
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Realtime ──────────────────────────────────────────────────
function subscribeRealtime() {
  if (state.regChannel) db.removeChannel(state.regChannel);

  state.regChannel = db
    .channel('registrations-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'registrations' },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          state.registrations.unshift(payload.new);
          toast('มีการลงทะเบียนใหม่: ' + payload.new.employee_id, 'success');
        } else if (payload.eventType === 'DELETE') {
          state.registrations = state.registrations.filter(
            r => r.employee_id !== payload.old.employee_id
          );
        }
        renderRegistrations();
        updateStats();
      })
    .subscribe();
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  const regCount = state.registrations.length;
  const wlCount  = state.whitelist.length;
  const wlOn     = !!state.config?.whitelist_enabled;

  $('stat-registered').textContent = regCount;
  $('stat-whitelist').textContent  = wlOn ? wlCount : '—';
  $('stat-whitelist-foot').textContent = wlOn ? 'Whitelist on' : 'Whitelist off';

  if (wlOn && wlCount > 0) {
    $('stat-rate').textContent = Math.round((regCount / wlCount) * 100) + '%';
  } else {
    $('stat-rate').textContent = '—';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(dt) {
  const date = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}
