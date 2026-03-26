/* ============================================================
   LIQUID GLASS CHECK-IN · app.js
   ============================================================ */
 
'use strict';
 
// ── State ────────────────────────────────────────────────────
const state = {
  employeeId: '',
  photoDataUrl: null,
  cameraStream: null,
  facingMode: 'user', // 'user' = front, 'environment' = rear
};
 
// ── DOM Refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
 
const screens = {
  welcome:  $('screen-welcome'),
  register: $('screen-register'),
  success:  $('screen-success'),
};
 
const employeeInput  = $('employee-id');
const idStatus       = $('id-status');
const idHint         = $('id-hint');
 
const cameraIdle     = $('camera-idle');
const cameraLive     = $('camera-live');
const cameraPreview  = $('camera-preview');
const cameraVideo    = $('camera-video');
const captureCanvas  = $('capture-canvas');
const previewImg     = $('preview-img');
 
const progressFill   = $('progress-fill');
const submitBtn      = $('btn-submit');
const submitLabel    = $('submit-label');
const submitLoader   = $('submit-loader');
 
// ── Screen Transitions ───────────────────────────────────────
function goTo(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (key === name) {
      el.classList.remove('hidden');
      // Reset scroll
      el.scrollTop = 0;
    } else {
      el.classList.add('hidden');
    }
  });
 
  if (name === 'register') {
    updateProgress();
  }
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
  const val = employeeInput.value.trim();
  state.employeeId = val;
 
  if (val.length === 0) {
    setInputState('neutral');
  } else if (val.length < 3) {
    setInputState('error', 'รหัสพนักงานต้องมีอย่างน้อย 3 ตัวอักษร');
  } else {
    setInputState('valid', 'รหัสพนักงาน: ' + val.toUpperCase());
  }
 
  updateProgress();
});
 
function setInputState(state, hint = null) {
  employeeInput.classList.remove('valid', 'error');
  idStatus.classList.remove('show-ok', 'show-err');
  idHint.classList.remove('error');
  idHint.textContent = hint || 'กรอกรหัส 3–10 ตัวอักษร';
 
  if (state === 'valid') {
    employeeInput.classList.add('valid');
    idStatus.innerHTML = '✓';
    idStatus.classList.add('show-ok');
  } else if (state === 'error') {
    employeeInput.classList.add('error');
    idStatus.innerHTML = '✕';
    idStatus.classList.add('show-err');
    idHint.classList.add('error');
  }
}
 
// ── Submit Gating ─────────────────────────────────────────────
function checkSubmitReady() {
  const ready = state.employeeId.trim().length >= 3 && !!state.photoDataUrl;
  submitBtn.disabled = !ready;
}
 
// ── Camera ────────────────────────────────────────────────────
async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: state.facingMode,
        width:  { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    };
 
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.cameraStream = stream;
    cameraVideo.srcObject = stream;
 
    // Mirror only front camera
    if (state.facingMode === 'user') {
      cameraLive.classList.remove('rear');
    } else {
      cameraLive.classList.add('rear');
    }
 
    showCameraState('live');
  } catch (err) {
    console.error('Camera error:', err);
    alert('ไม่สามารถเข้าถึงกล้องได้\nกรุณาอนุญาตการใช้กล้องในเบราว์เซอร์');
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
  const video  = cameraVideo;
  const canvas = captureCanvas;
  const vw = video.videoWidth  || 640;
  const vh = video.videoHeight || 480;
 
  // Square crop from center
  const side = Math.min(vw, vh);
  const sx   = (vw - side) / 2;
  const sy   = (vh - side) / 2;
 
  canvas.width  = side;
  canvas.height = side;
 
  const ctx = canvas.getContext('2d');
 
  // Mirror for front camera
  if (state.facingMode === 'user') {
    ctx.save();
    ctx.translate(side, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    ctx.restore();
  } else {
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  }
 
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  state.photoDataUrl = dataUrl;
  previewImg.src = dataUrl;
 
  // Flash effect
  triggerFlash();
 
  stopCamera();
  showCameraState('preview');
  updateProgress();
}
 
function showCameraState(mode) {
  cameraIdle.classList.toggle('hidden', mode !== 'idle');
  cameraLive.classList.toggle('hidden', mode !== 'live');
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
 
  // Loading state
  submitLabel.classList.add('hidden');
  submitLoader.classList.remove('hidden');
  submitBtn.classList.add('loading');
 
  // Simulate API call (replace with real fetch when backend is ready)
  await new Promise(r => setTimeout(r, 1600));
 
  // Populate success screen
  const idVal  = state.employeeId.trim().toUpperCase();
  const now    = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
 
  $('success-avatar').src = state.photoDataUrl;
  $('success-id-display').textContent = 'รหัส: ' + idVal;
  $('card-employee-id').textContent   = idVal;
  $('card-time').textContent          = timeStr + ' · ' + dateStr;
 
  goTo('success');
}
 
// ── Reset ─────────────────────────────────────────────────────
function resetForm() {
  state.employeeId  = '';
  state.photoDataUrl = null;
 
  employeeInput.value = '';
  setInputState('neutral');
  showCameraState('idle');
  stopCamera();
 
  submitLabel.classList.remove('hidden');
  submitLoader.classList.add('hidden');
  submitBtn.classList.remove('loading');
  submitBtn.disabled = true;
 
  progressFill.style.width = '0%';
}
 
// ── Save Confirmation Card ────────────────────────────────────
async function saveConfirmationCard() {
  const idVal   = state.employeeId.trim().toUpperCase();
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
 
  const W = 600, H = 760;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2; // retina
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
 
  // ── Background ──────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0,   '#0a0a0f');
  bgGrad.addColorStop(0.5, '#0f0f1a');
  bgGrad.addColorStop(1,   '#0a0f1a');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();
 
  // ── Orb glow top-left ───────────────────────────────────────
  const orb1 = ctx.createRadialGradient(60, 80, 0, 60, 80, 220);
  orb1.addColorStop(0,   'rgba(26,58,110,0.65)');
  orb1.addColorStop(1,   'transparent');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, H);
 
  // ── Orb glow bottom-right ───────────────────────────────────
  const orb2 = ctx.createRadialGradient(W - 60, H - 80, 0, W - 60, H - 80, 200);
  orb2.addColorStop(0,   'rgba(45,27,105,0.55)');
  orb2.addColorStop(1,   'transparent');
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, H);
 
  // ── Card border ─────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 32);
  ctx.stroke();
 
  // ── Top shine line ──────────────────────────────────────────
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
 
  // ── Photo (circle) ──────────────────────────────────────────
  const photoSize = 160;
  const photoX    = (W - photoSize) / 2;
  const photoY    = 60;
  const photoR    = photoSize / 2;
  const cx        = photoX + photoR;
  const cy        = photoY + photoR;
 
  // Glow ring
  const ringGlow = ctx.createRadialGradient(cx, cy, photoR - 4, cx, cy, photoR + 20);
  ringGlow.addColorStop(0,   'rgba(48,209,88,0.25)');
  ringGlow.addColorStop(1,   'transparent');
  ctx.fillStyle = ringGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, photoR + 20, 0, Math.PI * 2);
  ctx.fill();
 
  // Photo clipping
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.clip();
 
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, photoX, photoY, photoSize, photoSize);
      resolve();
    };
    img.onerror = resolve;
    img.src = state.photoDataUrl;
  });
 
  ctx.restore();
 
  // Photo border
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, photoR, 0, Math.PI * 2);
  ctx.stroke();
 
  // ── Check badge ─────────────────────────────────────────────
  const badgeR = 22;
  const bx = cx + photoR * 0.68;
  const by = cy + photoR * 0.68;
 
  ctx.fillStyle = '#30d158';
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fill();
 
  ctx.strokeStyle = '#0a0a0f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.stroke();
 
  // Checkmark
  ctx.strokeStyle = 'white';
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - 9,  by);
  ctx.lineTo(bx - 3,  by + 7);
  ctx.lineTo(bx + 9,  by - 7);
  ctx.stroke();
 
  // ── "ลงทะเบียนสำเร็จ" label ─────────────────────────────────
  const labelY = photoY + photoSize + 36;
  ctx.font      = '300 13px Prompt, sans-serif';
  ctx.fillStyle = '#30d158';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.08em';
  ctx.fillText('Registration successful', W / 2, labelY);
 
  // ── "ยินดีต้อนรับ!" ──────────────────────────────────────────
  ctx.font      = '200 34px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText('Wellcom!', W / 2, labelY + 46);
 
  // ── Employee ID ──────────────────────────────────────────────
  ctx.font      = '300 15px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Employee ID: ' + idVal, W / 2, labelY + 78);
 
  // ── Info Card ────────────────────────────────────────────────
  const cardX = 40, cardY = labelY + 106, cardW = W - 80, cardH = 140;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, 18);
  ctx.stroke();
 
  const rows = [
    { key: 'Employee ID', val: idVal },
    { key: 'Registration time', val: timeStr + ' · ' + dateStr },
    { key: 'Status',         val: '✓ You have already joined the BAU+ Workshop 2026' },
  ];
 
  rows.forEach((row, i) => {
    const ry = cardY + 26 + i * 40;
    // Divider (except first)
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + 20, ry - 14);
      ctx.lineTo(cardX + cardW - 20, ry - 14);
      ctx.stroke();
    }
    ctx.font      = '300 12px Prompt, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(row.key, cardX + 20, ry);
 
    ctx.font      = '400 14px Prompt, sans-serif';
    ctx.fillStyle = i === 2 ? '#30d158' : 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(row.val, cardX + cardW - 20, ry);
  });
 
  // ── Footer ───────────────────────────────────────────────────
  ctx.font      = '300 11px Prompt, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'center';
  ctx.fillText('BAU+ Workshop 2026', W / 2, H - 32);
 
  // ── Download ─────────────────────────────────────────────────
  const filename = `checkin_${idVal}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.jpg`;
  const link = document.createElement('a');
  link.href     = canvas.toDataURL('image/jpeg', 0.92);
  link.download = filename;
  link.click();
}
 
// ── Canvas helper: rounded rect ──────────────────────────────
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
 
$('btn-open-camera').addEventListener('click', () => startCamera());
 
$('btn-flip-camera').addEventListener('click', async () => {
  stopCamera();
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  await startCamera();
});
 
$('btn-close-camera').addEventListener('click', () => {
  stopCamera();
  showCameraState('idle');
});
 
$('btn-capture').addEventListener('click', () => capturePhoto());
 
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
 
// ── Input: uppercase transform ────────────────────────────────
employeeInput.addEventListener('keyup', (e) => {
  // Allow Enter to proceed if valid
  if (e.key === 'Enter' && state.employeeId.length >= 3) {
    employeeInput.blur();
  }
});
 
// ── Init ──────────────────────────────────────────────────────
(function init() {
  goTo('welcome');
  showCameraState('idle');
})();
