/* ============================================================
   LIQUID GLASS CHECK-IN · script.js
   ============================================================ */

'use strict';

// ════════════════════════════════════════════════════════════
// SUPABASE CLIENT (credentials อยู่ใน config.js)
// ════════════════════════════════════════════════════════════
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
const state = {
  employeeId:   '',
  photoDataUrl: null,
  cameraStream: null,
  facingMode:   'user',
  config:       null,
};

let currentLang = 'en';

// ── DOM Refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const screens = {
  welcome:  $('screen-welcome'),
  register: $('screen-register'),
  success:  $('screen-success'),
  closed:   $('screen-closed'),
};

const employeeInput = $('employee-id');
const idStatus      = $('id-status');
const idHint        = $('id-hint');

const cameraIdle    = $('camera-idle');
const cameraLive    = $('camera-live');
const cameraPreview = $('camera-preview');
const cameraVideo   = $('camera-video');
const captureCanvas = $('capture-canvas');
const previewImg    = $('preview-img');

const progressFill  = $('progress-fill');
const submitBtn     = $('btn-submit');
const submitLabel   = $('submit-label');
const submitLoader  = $('submit-loader');

// ── Screen Transitions ───────────────────────────────────────
let firstNav = true;

function goTo(name) {
  if (firstNav) {
    firstNav = false;
    const overlay = $('loading-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 400);
    }
  }

  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    if (key === name) {
      el.classList.remove('hidden');
      el.scrollTop = 0;
    } else {
      el.classList.add('hidden');
    }
  });

  if (name === 'register') updateProgress();
}

// ── Progress ─────────────────────────────────────────────────
function updateProgress() {
  const hasId    = state.employeeId.trim().length >= 3;
  const hasPhoto = !!state.photoDataUrl;
  const pct = (hasId ? 50 : 0) + (hasPhoto ? 50 : 0);
  progressFill.style.width = pct + '%';
  checkSubmitReady();
}

// ── Employee ID Validation ────────────────────────────────────
employeeInput.addEventListener('input', () => {
  state.employeeId = employeeInput.value.trim();
  renderIdValidation();
  updateProgress();
});

// แยกออกมาเพื่อให้ changeLanguage เรียกใช้ซ้ำได้ (อัปเดต hint ตามภาษา)
function renderIdValidation() {
  const val = state.employeeId;
  if (val.length === 0) {
    setInputState('neutral');
  } else if (val.length < 3) {
    setInputState('error', getTranslation('id_too_short'));
  } else {
    setInputState('valid', (getTranslation('id_valid_prefix') || '') + val.toUpperCase());
  }
}

function setInputState(s, hint = null) {
  employeeInput.classList.remove('valid', 'error');
  idStatus.classList.remove('show-ok', 'show-err');
  idHint.classList.remove('error');
  idHint.textContent = hint || getTranslation('id_hint_default') || 'Enter 3–10 character code';

  if (s === 'valid') {
    employeeInput.classList.add('valid');
    idStatus.innerHTML = '✓';
    idStatus.classList.add('show-ok');
  } else if (s === 'error') {
    employeeInput.classList.add('error');
    idStatus.innerHTML = '✕';
    idStatus.classList.add('show-err');
    idHint.classList.add('error');
  }
}

// ── Submit Gating ─────────────────────────────────────────────
function checkSubmitReady() {
  const ready = state.employeeId.trim().length >= 3
             && !!state.photoDataUrl
             && navigator.onLine;
  submitBtn.disabled = !ready;
}

// ── Network / Offline Awareness ───────────────────────────────
function updateOnlineStatus() {
  const offline = !navigator.onLine;
  const banner = $('offline-banner');
  if (banner) banner.classList.toggle('show', offline);
  checkSubmitReady();
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ── Supabase: Load Config ─────────────────────────────────────
async function loadConfig() {
  try {
    const { data, error } = await db
      .from('event_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;

    state.config = data;
    applyEventConfig(data);
    goTo(data.registration_open ? 'welcome' : 'closed');
  } catch (err) {
    console.warn('Config load failed, using defaults:', err.message);
    goTo('welcome');
  }
}

function applyEventConfig(cfg) {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  set('event-title-line1', cfg.event_title_line1 || 'BAU+');
  set('event-title-line2', cfg.event_title_line2 || 'Workshop');
  set('event-year-display', cfg.event_year || '2026');

  const footer = $('event-footer-display');
  if (footer) footer.textContent = `@ ${cfg.event_location} · ${cfg.event_date}`;

  const closedName = $('closed-event-name');
  if (closedName) {
    closedName.textContent =
      `${cfg.event_title_line1} ${cfg.event_title_line2} ${cfg.event_year}`;
  }
}

function getEventName() {
  if (!state.config) return 'BAU+ Workshop 2026';
  const { event_title_line1: l1, event_title_line2: l2, event_year: yr } = state.config;
  return `${l1} ${l2} ${yr}`;
}

// ── Supabase: Whitelist Check ─────────────────────────────────
async function checkWhitelist(employeeId) {
  if (!state.config?.whitelist_enabled) return { allowed: true };

  const { data, error } = await db
    .from('employees')
    .select('employee_id, name')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (error) throw error;
  return data ? { allowed: true, name: data.name } : { allowed: false };
}

// ── Supabase: Duplicate Check ─────────────────────────────────
async function checkDuplicate(employeeId) {
  const { data, error } = await db
    .from('registrations')
    .select('employee_id, registered_at')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (error) throw error;
  return data
    ? { duplicate: true, registeredAt: new Date(data.registered_at) }
    : { duplicate: false };
}

// ── Success Screen ────────────────────────────────────────────
function populateSuccessScreen(employeeId, regDate, isAlreadyRegistered) {
  const timeStr = regDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = regDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  $('success-avatar').src             = state.photoDataUrl;
  $('success-id-display').textContent = (getTranslation('id_prefix') || 'ID: ') + employeeId;
  $('card-employee-id').textContent   = employeeId;
  $('card-time').textContent          = timeStr + ' · ' + dateStr;

  const statusText = $('card-status-text');
  if (statusText) {
    statusText.textContent = getTranslation('status_joined_text') ||
      `You have already joined the ${getEventName()}`;
  }

  const labelSpan = document.querySelector('#screen-success .success-label .lang-text');
  if (labelSpan) {
    labelSpan.textContent = isAlreadyRegistered
      ? (getTranslation('already_registered_text') || 'Already registered')
      : (getTranslation('registration_success_text') || 'Registration successful');
  }

  const nameSpan = document.querySelector('#screen-success .success-name .lang-text');
  if (nameSpan) {
    nameSpan.textContent = isAlreadyRegistered
      ? (getTranslation('welcome_back_text') || 'Welcome back!')
      : (getTranslation('welcome_header') || 'Welcome!');
  }
}

// ── Error Toast ───────────────────────────────────────────────
function showToastError(msg) {
  const toast = $('error-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function resetSubmitButton() {
  submitLabel.classList.remove('hidden');
  submitLoader.classList.add('hidden');
  submitBtn.classList.remove('loading');
}

// ── Camera ────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    state.cameraStream = stream;
    cameraVideo.srcObject = stream;
    cameraLive.classList.toggle('rear', state.facingMode !== 'user');
    showCameraState('live');
  } catch (err) {
    console.error('Camera error:', err);
    showToastError(
      getTranslation('camera_error_text') ||
      'Cannot access camera. Please allow camera permission in your browser.'
    );
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  cameraVideo.srcObject = null;
}

function capturePhoto() {
  const vw = cameraVideo.videoWidth  || 640;
  const vh = cameraVideo.videoHeight || 480;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  captureCanvas.width  = side;
  captureCanvas.height = side;

  const ctx = captureCanvas.getContext('2d');
  if (state.facingMode === 'user') {
    ctx.save();
    ctx.translate(side, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraVideo, sx, sy, side, side, 0, 0, side, side);
    ctx.restore();
  } else {
    ctx.drawImage(cameraVideo, sx, sy, side, side, 0, 0, side, side);
  }

  state.photoDataUrl = captureCanvas.toDataURL('image/jpeg', 0.88);
  previewImg.src = state.photoDataUrl;
  triggerFlash();
  stopCamera();
  showCameraState('preview');
  updateProgress();
}

function showCameraState(mode) {
  cameraIdle.classList.toggle('hidden',    mode !== 'idle');
  cameraLive.classList.toggle('hidden',    mode !== 'live');
  cameraPreview.classList.toggle('hidden', mode !== 'preview');
}

function triggerFlash() {
  const flash = document.createElement('div');
  flash.className = 'flash-overlay';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);
}

// ── Submit ────────────────────────────────────────────────────
async function handleSubmit() {
  if (submitBtn.disabled) return;

  if (!navigator.onLine) {
    showToastError(getTranslation('offline_submit') || 'No internet connection.');
    return;
  }

  submitLabel.classList.add('hidden');
  submitLoader.classList.remove('hidden');
  submitBtn.classList.add('loading');

  const employeeId = state.employeeId.trim().toUpperCase();

  try {
    // 1. Whitelist check (ถ้าเปิดใช้งาน)
    const wl = await checkWhitelist(employeeId);
    if (!wl.allowed) {
      showToastError(
        getTranslation('whitelist_error') || 'Employee ID not found in the attendee list.'
      );
      resetSubmitButton();
      return;
    }

    // 2. Duplicate check
    const dup = await checkDuplicate(employeeId);
    if (dup.duplicate) {
      populateSuccessScreen(employeeId, dup.registeredAt, true);
      goTo('success');
      return;
    }

    // 3. Insert registration
    const { error } = await db
      .from('registrations')
      .insert({ employee_id: employeeId });

    if (error) throw error;

    populateSuccessScreen(employeeId, new Date(), false);
    goTo('success');

  } catch (err) {
    console.error('Submit error:', err);
    showToastError(
      getTranslation('submit_error') || 'Registration failed. Please try again.'
    );
    resetSubmitButton();
  }
}

// ── Reset ─────────────────────────────────────────────────────
function resetForm() {
  state.employeeId   = '';
  state.photoDataUrl = null;

  employeeInput.value = '';
  setInputState('neutral');
  showCameraState('idle');
  stopCamera();
  resetSubmitButton();
  submitBtn.disabled = true;
  progressFill.style.width = '0%';
}

// ── Save Confirmation Card ────────────────────────────────────
async function saveConfirmationCard() {
  const idVal   = state.employeeId.trim().toUpperCase();
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const eventStr = getEventName();

  const W = 600, H = 760;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0,   '#0a0a0f');
  bgGrad.addColorStop(0.5, '#0f0f1a');
  bgGrad.addColorStop(1,   '#0a0f1a');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

  const orb1 = ctx.createRadialGradient(60, 80, 0, 60, 80, 220);
  orb1.addColorStop(0, 'rgba(26,58,110,0.65)');
  orb1.addColorStop(1, 'transparent');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, H);

  const orb2 = ctx.createRadialGradient(W - 60, H - 80, 0, W - 60, H - 80, 200);
  orb2.addColorStop(0, 'rgba(45,27,105,0.55)');
  orb2.addColorStop(1, 'transparent');
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 32);
  ctx.stroke();

  const shine = ctx.createLinearGradient(80, 0, W - 80, 0);
  shine.addColorStop(0,   'transparent');
  shine.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  shine.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  shine.addColorStop(1,   'transparent');
  ctx.strokeStyle = shine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 1); ctx.lineTo(W - 80, 1);
  ctx.stroke();

  // Photo (circle)
  const photoSize = 160, photoX = (W - photoSize) / 2, photoY = 60;
  const photoR = photoSize / 2, cx = photoX + photoR, cy = photoY + photoR;

  const ringGlow = ctx.createRadialGradient(cx, cy, photoR - 4, cx, cy, photoR + 20);
  ringGlow.addColorStop(0, 'rgba(48,209,88,0.25)');
  ringGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = ringGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, photoR + 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.clip();
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, photoX, photoY, photoSize, photoSize); resolve(); };
    img.onerror = resolve;
    img.src = state.photoDataUrl;
  });
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.stroke();

  const badgeR = 22, bx = cx + photoR * 0.68, by = cy + photoR * 0.68;
  ctx.fillStyle = '#30d158';
  ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0a0a0f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - 9, by); ctx.lineTo(bx - 3, by + 7); ctx.lineTo(bx + 9, by - 7);
  ctx.stroke();

  // Text labels
  const labelY = photoY + photoSize + 36;
  ctx.textAlign = 'center';
  ctx.font = '300 13px Prompt, sans-serif';
  ctx.fillStyle = '#30d158';
  ctx.letterSpacing = '0.08em';
  ctx.fillText('Registration successful', W / 2, labelY);

  ctx.font = '200 34px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText('Welcome!', W / 2, labelY + 46);

  ctx.font = '300 15px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Employee ID: ' + idVal, W / 2, labelY + 78);

  // Info card
  const cardX = 40, cardY = labelY + 106, cardW = W - 80, cardH = 140;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
  roundRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, 18); ctx.stroke();

  const rows = [
    { key: 'Employee ID',       val: idVal },
    { key: 'Registration time', val: timeStr + ' · ' + dateStr },
    { key: 'Status',            val: `✓ You have already joined the ${eventStr}` },
  ];

  rows.forEach((row, i) => {
    const ry = cardY + 26 + i * 40;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + 20, ry - 14); ctx.lineTo(cardX + cardW - 20, ry - 14);
      ctx.stroke();
    }
    ctx.font = '300 12px Prompt, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(row.key, cardX + 20, ry);
    ctx.font = '400 14px Prompt, sans-serif';
    ctx.fillStyle = i === 2 ? '#30d158' : 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(row.val, cardX + cardW - 20, ry);
  });

  ctx.font = '300 11px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'center';
  ctx.fillText(eventStr, W / 2, H - 32);

  const filename = `checkin_${idVal}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.jpg`;
  const link = document.createElement('a');
  link.href     = canvas.toDataURL('image/jpeg', 0.92);
  link.download = filename;
  link.click();
}

// ── Canvas helper ─────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Event Listeners ───────────────────────────────────────────
$('btn-start').addEventListener('click', () => goTo('register'));

$('btn-back').addEventListener('click', () => {
  stopCamera();
  goTo('welcome');
});

$('btn-open-camera').addEventListener('click',  () => startCamera());
$('btn-capture').addEventListener('click',      () => capturePhoto());

$('btn-flip-camera').addEventListener('click', async () => {
  stopCamera();
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  await startCamera();
});

$('btn-close-camera').addEventListener('click', () => {
  stopCamera();
  showCameraState('idle');
});

$('btn-retake').addEventListener('click', () => {
  state.photoDataUrl = null;
  previewImg.src = '';
  showCameraState('idle');
  updateProgress();
});

submitBtn.addEventListener('click', handleSubmit);

$('btn-done').addEventListener('click', async () => {
  await saveConfirmationCard();
  resetForm();
  goTo('welcome');
});

employeeInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter' && state.employeeId.length >= 3) employeeInput.blur();
});

// ── Translations ──────────────────────────────────────────────
const translations = {
  'th': {
    'welcome_title':             'ยินดีต้อนรับ',
    'welcome_sub':               'โปรดลงทะเบียนเพื่อยืนยันการเข้าร่วมของคุณ',
    'start_button':              'เริ่มลงทะเบียน',
    'registration_title':        'การลงทะเบียน',
    'employee_id_label':         'รหัสพนักงาน',
    'photo_verification_text':   'ถ่ายรูปเพื่อยืนยันตัวตน',
    'camera_idle_text':          'แตะเพื่อเปิดกล้อง',
    'camera_sub_text':           'รองรับกล้องหน้าและกล้องหลัง',
    'open_camera_text':          'เปิดกล้อง',
    'retake_photo_text':         'ถ่ายรูปใหม่',
    'confirm_registration_text': 'ยืนยันการลงทะเบียน',
    'privacy_note_text':         'เพื่อความเป็นส่วนตัวของคุณ รูปภาพของคุณจะไม่ถูกจัดเก็บ',
    'registration_success_text': 'การลงทะเบียนสำเร็จ',
    'already_registered_text':   'ลงทะเบียนแล้ว',
    'welcome_header':            'ยินดีต้อนรับ!',
    'welcome_back_text':         'ยินดีต้อนรับกลับมา!',
    'status_joined_text':        'คุณได้เข้าร่วมงานแล้ว',
    'whitelist_error':           'ไม่พบรหัสพนักงานในรายชื่อผู้เข้าร่วม',
    'submit_error':              'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    'camera_error_text':         'ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์',
    'closed_title':              'ปิดรับการลงทะเบียน',
    'closed_sub':                'กิจกรรมสิ้นสุดแล้ว ขอบคุณที่เข้าร่วม',
    'photo_saved_text':          'บันทึกแล้ว',
    'card_employee_id':          'รหัสพนักงาน',
    'card_time':                 'เวลาลงทะเบียน',
    'card_status':               'สถานะ',
    'completed_text':            'เสร็จสิ้น',
    'id_prefix':                 'รหัส: ',
    'id_hint_default':           'กรอกรหัส 3–10 ตัวอักษร',
    'id_too_short':              'รหัสพนักงานต้องมีอย่างน้อย 3 ตัวอักษร',
    'id_valid_prefix':           'รหัสพนักงาน: ',
    'offline_banner':            'ไม่มีการเชื่อมต่ออินเทอร์เน็ต',
    'offline_submit':            'ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อใหม่เพื่อลงทะเบียน',
  },
  'en': {
    'welcome_title':             'Welcome to',
    'welcome_sub':               'Please register to confirm your attendance',
    'start_button':              'Start registration',
    'registration_title':        'Registration',
    'employee_id_label':         'Employee ID',
    'photo_verification_text':   'Take a photo for identity verification',
    'camera_idle_text':          'Tap to open camera',
    'camera_sub_text':           'Supports front camera · rear camera',
    'open_camera_text':          'Open Camera',
    'retake_photo_text':         'Retake photo',
    'confirm_registration_text': 'Confirm registration',
    'privacy_note_text':         'For your privacy, your photo will not be stored',
    'registration_success_text': 'Registration successful',
    'already_registered_text':   'Already registered',
    'welcome_header':            'Welcome!',
    'welcome_back_text':         'Welcome back!',
    'status_joined_text':        'You have already joined the event',
    'whitelist_error':           'Employee ID not found in the attendee list.',
    'submit_error':              'Registration failed. Please try again.',
    'camera_error_text':         'Cannot access camera. Please allow camera permission in your browser.',
    'closed_title':              'Registration Closed',
    'closed_sub':                'This event has concluded. Thank you for participating.',
    'photo_saved_text':          'Saved',
    'card_employee_id':          'Employee ID',
    'card_time':                 'Registration time',
    'card_status':               'Status',
    'completed_text':            'Completed',
    'id_prefix':                 'ID: ',
    'id_hint_default':           'Enter 3–10 character code',
    'id_too_short':              'Employee code must be at least 3 characters',
    'id_valid_prefix':           'Employee ID: ',
    'offline_banner':            'No internet connection',
    'offline_submit':            'No internet connection. Please reconnect to register.',
  },
  'vn': {
    'welcome_title':             'Chào mừng đến với',
    'welcome_sub':               'Vui lòng đăng ký để xác nhận sự tham dự của bạn',
    'start_button':              'Bắt đầu đăng ký',
    'registration_title':        'Sự đăng ký',
    'employee_id_label':         'Mã số nhân viên',
    'photo_verification_text':   'Chụp ảnh để xác minh danh tính',
    'camera_idle_text':          'Nhấn để mở camera',
    'camera_sub_text':           'Hỗ trợ camera trước · camera sau',
    'open_camera_text':          'Mở camera',
    'retake_photo_text':         'Chụp lại ảnh',
    'confirm_registration_text': 'Xác nhận đăng ký',
    'privacy_note_text':         'Để bảo vệ quyền riêng tư của bạn, ảnh của bạn sẽ không được lưu trữ.',
    'registration_success_text': 'Đăng ký thành công',
    'already_registered_text':   'Đã đăng ký rồi',
    'welcome_header':            'Chào mừng!',
    'welcome_back_text':         'Chào mừng trở lại!',
    'status_joined_text':        'Bạn đã tham gia sự kiện',
    'whitelist_error':           'Mã nhân viên không có trong danh sách người tham dự.',
    'submit_error':              'Đăng ký thất bại. Vui lòng thử lại.',
    'camera_error_text':         'Không thể truy cập camera. Vui lòng cho phép quyền truy cập camera trong trình duyệt.',
    'closed_title':              'Đã đóng đăng ký',
    'closed_sub':                'Sự kiện đã kết thúc. Cảm ơn bạn đã tham gia.',
    'photo_saved_text':          'Đã lưu',
    'card_employee_id':          'Mã nhân viên',
    'card_time':                 'Thời gian đăng ký',
    'card_status':               'Trạng thái',
    'completed_text':            'Hoàn tất',
    'id_prefix':                 'Mã: ',
    'id_hint_default':           'Nhập mã 3–10 ký tự',
    'id_too_short':              'Mã nhân viên phải có ít nhất 3 ký tự',
    'id_valid_prefix':           'Mã nhân viên: ',
    'offline_banner':            'Không có kết nối internet',
    'offline_submit':            'Không có internet. Vui lòng kết nối lại để đăng ký.',
  },
  'la': {
    'welcome_title':             'ຍິນດີຕ້ອນຮັບສູ່',
    'welcome_sub':               'ກະລຸນາລົງທະບຽນເພື່ອຢືນຢັນການເຂົ້າຮ່ວມຂອງທ່ານ',
    'start_button':              'ເລີ່ມການລົງທະບຽນ',
    'registration_title':        'ການລົງທະບຽນ',
    'employee_id_label':         'ລະຫັດພະນັກງານ',
    'photo_verification_text':   'ຖ່າຍຮູບເພື່ອຢືນຢັນຕົວຕົນ',
    'camera_idle_text':          'ແຕະເພື່ອເປີດກ້ອງຖ່າຍຮູບ',
    'camera_sub_text':           'ຮອງຮັບກ້ອງໜ້າ · ກ້ອງຫຼັງ',
    'open_camera_text':          'ເປີດກ້ອງຖ່າຍຮູບ',
    'retake_photo_text':         'ຖ່າຍຮູບຄືນໃໝ່',
    'confirm_registration_text': 'ຢືນຢັນການລົງທະບຽນ',
    'privacy_note_text':         'ເພື່ອຄວາມເປັນສ່ວນຕົວຂອງທ່ານ, ຮູບພາບຂອງທ່ານຈະບໍ່ຖືກບັນທຶກໄວ້',
    'registration_success_text': 'ການລົງທະບຽນສຳເລັດແລ້ວ',
    'already_registered_text':   'ລົງທະບຽນແລ້ວ',
    'welcome_header':            'ຍິນດີຕ້ອນຮັບ!',
    'welcome_back_text':         'ຍິນດີຕ້ອນຮັບກັບມາ!',
    'status_joined_text':        'ທ່ານໄດ້ເຂົ້າຮ່ວມງານແລ້ວ',
    'whitelist_error':           'ບໍ່ພົບລະຫັດພະນັກງານໃນລາຍຊື່ຜູ້ເຂົ້າຮ່ວມ',
    'submit_error':              'ການລົງທະບຽນລ້ມເຫຼວ. ກະລຸນາລອງໃໝ່.',
    'camera_error_text':         'ບໍ່ສາມາດເຂົ້າຫາກ້ອງໄດ້. ກະລຸນາອະນຸຍາດໃຫ້ໃຊ້ກ້ອງໃນບຣາວເຊີ',
    'closed_title':              'ປິດຮັບການລົງທະບຽນ',
    'closed_sub':                'ກິດຈະກຳສິ້ນສຸດແລ້ວ. ຂອບໃຈທີ່ເຂົ້າຮ່ວມ.',
    'photo_saved_text':          'ບັນທຶກແລ້ວ',
    'card_employee_id':          'ລະຫັດພະນັກງານ',
    'card_time':                 'ເວລາລົງທະບຽນ',
    'card_status':               'ສະຖານะ',
    'completed_text':            'ສຳເລັດ',
    'id_prefix':                 'ລະຫັດ: ',
    'id_hint_default':           'ປ້ອນລະຫັດ 3–10 ຕົວອັກສອນ',
    'id_too_short':              'ລະຫັດພະນັກງານຕ້ອງມີຢ່າງໜ້ອຍ 3 ຕົວອັກສອນ',
    'id_valid_prefix':           'ລະຫັດພະນັກງານ: ',
    'offline_banner':            'ບໍ່ມີການເຊື່ອມຕໍ່ອິນເຕີເນັດ',
    'offline_submit':            'ບໍ່ມີອິນເຕີເນັດ. ກະລຸນາເຊື່ອມຕໍ່ໃໝ່ເພື່ອລົງທະບຽນ.',
  },
};

function getTranslation(key) {
  return translations[currentLang]?.[key] ?? translations['en']?.[key] ?? null;
}

// เดาภาษาจาก: localStorage → browser → fallback 'en'
function detectLanguage() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && translations[saved]) return saved;
  } catch (_) { /* localStorage อาจถูกปิด */ }

  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('th')) return 'th';
  if (nav.startsWith('vi')) return 'vn';
  if (nav.startsWith('lo')) return 'la';
  return 'en';
}

const HTML_LANG = { th: 'th', en: 'en', vn: 'vi', la: 'lo' };

function changeLanguage(lang) {
  if (!translations[lang]) lang = 'en';
  currentLang = lang;

  try { localStorage.setItem('lang', lang); } catch (_) { /* ignore */ }
  document.documentElement.lang = HTML_LANG[lang] || 'en';

  // แปลข้อความ static ทั้งหมด
  document.querySelectorAll('.lang-text').forEach(el => {
    const key = el.getAttribute('data-key');
    const t = translations[lang]?.[key];
    if (t) el.innerText = t;
  });

  // ไฮไลต์ปุ่มภาษาที่เลือก
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });

  // อัปเดตข้อความ dynamic ที่ไม่ใช่ .lang-text
  renderIdValidation();
  refreshSuccessText();
}

// ข้อความในหน้า success ที่ JS เป็นคนใส่ (prefix รหัส + สถานะ)
function refreshSuccessText() {
  if (screens.success?.classList.contains('hidden')) return;
  const id = state.employeeId.trim().toUpperCase();
  if (id) {
    $('success-id-display').textContent = (getTranslation('id_prefix') || 'ID: ') + id;
  }
  const statusText = $('card-status-text');
  if (statusText) {
    statusText.textContent = getTranslation('status_joined_text') ||
      `You have already joined the ${getEventName()}`;
  }
}

// ── Service Worker (PWA) ──────────────────────────────────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // SW ต้องเสิร์ฟผ่าน http/https
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
  changeLanguage(detectLanguage());
  updateOnlineStatus();
  showCameraState('idle');
  registerServiceWorker();
  loadConfig();
})();
