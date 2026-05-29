/* ============================================================
   Service Worker · Event Check-in PWA
   ────────────────────────────────────────────────────────────
   กลยุทธ์:
   - App shell (HTML/CSS/JS/icons) → cache-first เพื่อเปิดได้แม้ offline
   - Supabase API / requests อื่น → network-only (ข้อมูลต้องสด, ห้าม cache)
   ============================================================ */

const CACHE = 'checkin-shell-v1';

const SHELL = [
  './',
  './index.html',
  './closed.html',
  './style.css',
  './script.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // เฉพาะ GET เท่านั้น
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // อย่าแตะ Supabase หรือ cross-origin API — ต้องเป็นข้อมูลสดเสมอ
  if (url.hostname.includes('supabase') || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    return; // ปล่อยให้ browser จัดการ network ตามปกติ
  }

  // App shell + static (same-origin หรือ font/cdn) → cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          // cache เฉพาะ same-origin ที่สำเร็จ
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => cached); // offline + ไม่มี cache → undefined
    })
  );
});
