/* ============================================================
   ADMIN DASHBOARD · admin.js (Multi-event)
   ============================================================ */

'use strict';

const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

const state = {
  events:          [],
  activeEventId:   null,   // app_settings.active_event_id
  selectedEventId: null,   // งานที่กำลังดูอยู่
  registrations:   [],
  whitelist:       [],
  regChannel:      null,
};

const selectedEvent = () => state.events.find(e => e.id === state.selectedEventId) || null;
const eventName = (e) => e ? `${e.event_title_line1} ${e.event_title_line2} ${e.event_year}` : '—';

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
});

$('logout-btn').addEventListener('click', async () => { await db.auth.signOut(); });

db.auth.onAuthStateChange((_event, session) => {
  if (session) showDashboard(session);
  else showLogin();
});

function showLogin() {
  $('admin-login').classList.remove('hidden');
  $('admin-dashboard').classList.add('hidden');
  unsubscribeRealtime();
}

async function showDashboard(session) {
  $('admin-login').classList.add('hidden');
  $('admin-dashboard').classList.remove('hidden');
  $('admin-user-email').textContent = session.user.email;
  $('login-form').reset();

  await loadEvents();
}

// ── Events ────────────────────────────────────────────────────
async function loadEvents() {
  const [{ data: events, error: e1 }, { data: settings, error: e2 }] = await Promise.all([
    db.from('events').select('*').order('created_at', { ascending: false }),
    db.from('app_settings').select('active_event_id').eq('id', 1).maybeSingle(),
  ]);

  if (e1) { toast('โหลดงานไม่สำเร็จ: ' + e1.message, 'error'); return; }
  if (e2) console.warn('settings load:', e2.message);

  state.events = events || [];
  state.activeEventId = settings?.active_event_id || null;

  // เลือกงาน: คงงานเดิมถ้ายังมี → ไม่งั้นใช้ active → ไม่งั้นงานแรก
  if (!state.events.some(e => e.id === state.selectedEventId)) {
    state.selectedEventId = state.activeEventId && state.events.some(e => e.id === state.activeEventId)
      ? state.activeEventId
      : (state.events[0]?.id || null);
  }

  renderEventSelector();
  await selectEvent(state.selectedEventId);
}

function renderEventSelector() {
  const sel = $('event-select');
  sel.innerHTML = '';
  state.events.forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = eventName(e) + (e.id === state.activeEventId ? '  ●' : '');
    sel.appendChild(opt);
  });
  sel.value = state.selectedEventId || '';
}

$('event-select').addEventListener('change', (e) => selectEvent(e.target.value));

async function selectEvent(eventId) {
  state.selectedEventId = eventId || null;
  if (!state.selectedEventId) {
    toast('ยังไม่มีงาน — กด "New event" เพื่อสร้าง', 'error');
    return;
  }

  // active badge + link hint
  const isActive = state.selectedEventId === state.activeEventId;
  $('active-badge').classList.toggle('hidden', !isActive);
  $('set-active-btn').disabled = isActive;

  const origin = location.origin + location.pathname.replace(/admin\.html$/, 'index.html');
  $('event-link-hint').textContent = `ลิงก์ลงทะเบียนงานนี้: ${origin}?event=${state.selectedEventId}`;

  fillConfigForm(selectedEvent());
  await Promise.all([loadWhitelist(), loadRegistrations()]);
  subscribeRealtime();
}

$('new-event-btn').addEventListener('click', async () => {
  const { data, error } = await db.from('events').insert({
    event_title_line1: 'New',
    event_title_line2: 'Event',
    event_year: String(new Date().getFullYear()),
  }).select().single();

  if (error) { toast('สร้างงานไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.selectedEventId = data.id;
  await loadEvents();
  toast('สร้างงานใหม่แล้ว — แก้รายละเอียดด้านล่างได้เลย', 'success');
});

$('set-active-btn').addEventListener('click', async () => {
  if (!state.selectedEventId) return;
  const { error } = await db.from('app_settings')
    .update({ active_event_id: state.selectedEventId }).eq('id', 1);

  if (error) { toast('ตั้ง active ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.activeEventId = state.selectedEventId;
  renderEventSelector();
  $('event-select').value = state.selectedEventId;
  $('active-badge').classList.remove('hidden');
  $('set-active-btn').disabled = true;
  toast('ตั้งงานนี้เป็น active แล้ว', 'success');
});

$('delete-event-btn').addEventListener('click', async () => {
  const ev = selectedEvent();
  if (!ev) return;
  if (state.events.length <= 1) { toast('ต้องมีอย่างน้อย 1 งาน', 'error'); return; }
  if (!confirm(`ลบงาน "${eventName(ev)}" และข้อมูลลงทะเบียน/whitelist ทั้งหมด?`)) return;

  const { error } = await db.from('events').delete().eq('id', ev.id);
  if (error) { toast('ลบงานไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.selectedEventId = null;
  await loadEvents();
  toast('ลบงานแล้ว', 'success');
});

// ── Config ────────────────────────────────────────────────────
function fillConfigForm(ev) {
  if (!ev) return;
  $('cfg-title1').value   = ev.event_title_line1 || '';
  $('cfg-title2').value   = ev.event_title_line2 || '';
  $('cfg-year').value     = ev.event_year || '';
  $('cfg-location').value = ev.event_location || '';
  $('cfg-date').value     = ev.event_date || '';
  $('cfg-open').checked      = !!ev.registration_open;
  $('cfg-whitelist').checked = !!ev.whitelist_enabled;
}

$('save-config-btn').addEventListener('click', async () => {
  if (!state.selectedEventId) return;
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

  const { error } = await db.from('events').update(payload).eq('id', state.selectedEventId);

  $('save-config-label').classList.remove('hidden');
  $('save-config-spinner').classList.add('hidden');
  btn.disabled = false;

  if (error) { toast('บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }

  const ev = selectedEvent();
  if (ev) Object.assign(ev, payload);
  renderEventSelector();
  $('event-select').value = state.selectedEventId;
  updateStats();
  toast('บันทึก config แล้ว', 'success');
});

// ── Whitelist (scoped to selected event) ──────────────────────
async function loadWhitelist() {
  const { data, error } = await db
    .from('employees')
    .select('*')
    .eq('event_id', state.selectedEventId)
    .order('employee_id', { ascending: true });

  if (error) { toast('โหลด whitelist ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.whitelist = data || [];
  renderWhitelist();
  updateStats();
}

function renderWhitelist() {
  const tbody = $('wl-tbody');
  $('wl-count').textContent = state.whitelist.length;
  $('wl-empty').classList.toggle('hidden', state.whitelist.length > 0);

  tbody.innerHTML = '';
  state.whitelist.forEach((emp) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-mono">${escapeHtml(emp.employee_id)}</td>
      <td>${escapeHtml(emp.name || '—')}</td>
      <td>${escapeHtml(emp.department || '—')}</td>
      <td><button class="admin-btn admin-btn-danger">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => deleteEmployee(emp.employee_id));
    tbody.appendChild(tr);
  });
}

$('wl-add-btn').addEventListener('click', async () => {
  if (!state.selectedEventId) return;
  const id   = $('wl-id').value.trim().toUpperCase();
  const name = $('wl-name').value.trim();
  const dept = $('wl-dept').value.trim();

  if (id.length < 3) { toast('Employee ID ต้องมีอย่างน้อย 3 ตัวอักษร', 'error'); return; }

  const { error } = await db.from('employees').insert({
    event_id: state.selectedEventId,
    employee_id: id,
    name: name || null,
    department: dept || null,
  });

  if (error) {
    toast(error.code === '23505' ? 'มี ID นี้ในงานนี้แล้ว' : 'เพิ่มไม่สำเร็จ: ' + error.message, 'error');
    return;
  }

  $('wl-id').value = ''; $('wl-name').value = ''; $('wl-dept').value = '';
  await loadWhitelist();
  toast('เพิ่มรายชื่อแล้ว', 'success');
});

$('wl-import-btn').addEventListener('click', async () => {
  if (!state.selectedEventId) return;
  const raw = $('wl-bulk').value.trim();
  if (!raw) { toast('กรุณาวางรายชื่อก่อน', 'error'); return; }

  const rows = raw.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [id, name, dept] = line.split(',').map(s => (s || '').trim());
      return {
        event_id: state.selectedEventId,
        employee_id: (id || '').toUpperCase(),
        name: name || null,
        department: dept || null,
      };
    })
    .filter(r => r.employee_id.length >= 3);

  if (!rows.length) { toast('ไม่พบรายชื่อที่ถูกต้อง', 'error'); return; }

  const { error } = await db.from('employees').upsert(rows, { onConflict: 'event_id,employee_id' });
  if (error) { toast('Import ไม่สำเร็จ: ' + error.message, 'error'); return; }

  $('wl-bulk').value = '';
  await loadWhitelist();
  toast(`Import ${rows.length} รายชื่อแล้ว`, 'success');
});

async function deleteEmployee(id) {
  if (!confirm(`ลบ ${id} ออกจาก whitelist?`)) return;
  const { error } = await db.from('employees').delete()
    .eq('event_id', state.selectedEventId).eq('employee_id', id);
  if (error) { toast('ลบไม่สำเร็จ: ' + error.message, 'error'); return; }
  await loadWhitelist();
  toast('ลบแล้ว', 'success');
}

// ── Registrations (scoped to selected event) ──────────────────
async function loadRegistrations() {
  const { data, error } = await db
    .from('registrations')
    .select('*')
    .eq('event_id', state.selectedEventId)
    .order('registered_at', { ascending: false });

  if (error) { toast('โหลด registrations ไม่สำเร็จ: ' + error.message, 'error'); return; }

  state.registrations = data || [];
  renderRegistrations();
  updateStats();
}

function renderRegistrations() {
  const tbody  = $('reg-tbody');
  const filter = $('reg-search').value.trim().toUpperCase();
  const list = filter
    ? state.registrations.filter(r => r.employee_id.toUpperCase().includes(filter))
    : state.registrations;

  $('reg-count').textContent = state.registrations.length;
  const empty = $('reg-empty');
  empty.classList.toggle('hidden', list.length > 0);
  empty.textContent = (list.length === 0 && filter) ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีการลงทะเบียน';

  tbody.innerHTML = '';
  list.forEach((reg, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="col-mono">${escapeHtml(reg.employee_id)}</td>
      <td>${formatDateTime(new Date(reg.registered_at))}</td>
      <td><button class="admin-btn admin-btn-danger">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => deleteRegistration(reg.employee_id));
    tbody.appendChild(tr);
  });
}

$('reg-search').addEventListener('input', renderRegistrations);

async function deleteRegistration(id) {
  if (!confirm(`ลบการลงทะเบียนของ ${id}?`)) return;
  const { error } = await db.from('registrations').delete()
    .eq('event_id', state.selectedEventId).eq('employee_id', id);
  if (error) { toast('ลบไม่สำเร็จ: ' + error.message, 'error'); return; }
  await loadRegistrations();
  toast('ลบแล้ว', 'success');
}

// ── Export CSV ────────────────────────────────────────────────
$('export-btn').addEventListener('click', () => {
  if (!state.registrations.length) { toast('ยังไม่มีข้อมูลให้ export', 'error'); return; }

  const header = ['No', 'Employee ID', 'Registered At'];
  const lines = state.registrations.map((r, i) =>
    [i + 1, r.employee_id, new Date(r.registered_at).toISOString()].map(csvCell).join(',')
  );
  const csv = '﻿' + [header.join(','), ...lines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const name = (selectedEvent()?.event_title_line1 || 'event').replace(/\s+/g, '_');
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

// ── Employee Lookup (cross-event history) ─────────────────────
$('lookup-btn').addEventListener('click', runLookup);
$('lookup-id').addEventListener('keyup', (e) => { if (e.key === 'Enter') runLookup(); });

async function runLookup() {
  const id = $('lookup-id').value.trim().toUpperCase();
  if (id.length < 3) { toast('กรอก Employee ID อย่างน้อย 3 ตัว', 'error'); return; }

  const { data, error } = await db
    .from('registrations')
    .select('registered_at, events(event_title_line1, event_title_line2, event_year)')
    .eq('employee_id', id)
    .order('registered_at', { ascending: false });

  if (error) { toast('ค้นหาไม่สำเร็จ: ' + error.message, 'error'); return; }

  const table = $('lookup-table');
  const empty = $('lookup-empty');
  const tbody = $('lookup-tbody');
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  table.classList.remove('hidden');
  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(eventName(row.events))}</td>
      <td>${formatDateTime(new Date(row.registered_at))}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Realtime (scoped client-side to selected event) ───────────
function unsubscribeRealtime() {
  if (state.regChannel) { db.removeChannel(state.regChannel); state.regChannel = null; }
}

function subscribeRealtime() {
  unsubscribeRealtime();
  state.regChannel = db
    .channel('registrations-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'registrations' },
      (payload) => {
        const ev = payload.new?.event_id ?? payload.old?.event_id;
        // โหลดใหม่เฉพาะเมื่อเกี่ยวกับงานที่กำลังดู (DELETE อาจไม่มี event_id → โหลดเผื่อไว้)
        if (ev === undefined || ev === state.selectedEventId) {
          if (payload.eventType === 'INSERT' && payload.new?.event_id === state.selectedEventId) {
            toast('มีการลงทะเบียนใหม่: ' + payload.new.employee_id, 'success');
          }
          loadRegistrations();
        }
      })
    .subscribe();
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  const regCount = state.registrations.length;
  const wlCount  = state.whitelist.length;
  const wlOn     = !!selectedEvent()?.whitelist_enabled;

  $('stat-registered').textContent = regCount;
  $('stat-whitelist').textContent  = wlOn ? wlCount : '—';
  $('stat-whitelist-foot').textContent = wlOn ? 'Whitelist on' : 'Whitelist off';
  $('stat-rate').textContent = (wlOn && wlCount > 0)
    ? Math.round((regCount / wlCount) * 100) + '%'
    : '—';
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
