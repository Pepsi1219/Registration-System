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

$('btn-done').addEventListener('click', () => {
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
