# Event Check-in System

ระบบลงทะเบียน/เช็คอินงานอีเวนต์ แบบ self-service — เว็บ static (HTML/CSS/JS) + [Supabase](https://supabase.com) เป็น backend ดีไซน์สไตล์ "Liquid Glass" รองรับ 4 ภาษา (ไทย / English / Tiếng Việt / ພາສາລາວ), ติดตั้งเป็น PWA ได้, และรองรับหลายงาน (multi-event)

## ฟีเจอร์

- 📝 ลงทะเบียนด้วย Employee ID (ถ่ายรูปได้ แต่ **ไม่บังคับ** และไม่เก็บรูป)
- 🌐 หลายภาษา + auto-detect + จำภาษาที่เลือก
- 🗂️ **Multi-event** — จัดได้หลายงาน, เลือกงานผ่าน `?event=<id>` หรือใช้งาน active
- 🔁 กันลงทะเบียนซ้ำ (1 คน / 1 ครั้ง / 1 งาน)
- 🎪 **Kiosk mode** (`?kiosk=1`) — auto-reset สำหรับตั้งเครื่องหน้างาน
- 📱 PWA — ติดตั้งบนมือถือ + ใช้งาน offline ได้บางส่วน
- 🔴 ตรวจจับ offline + แจ้งเตือน
- 🛠️ **Admin dashboard** — สลับงาน, แก้ config, จัดการ whitelist, ดูยอด real-time, export CSV, ค้นประวัติพนักงานข้ามงาน

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` / `script.js` / `style.css` | หน้าลงทะเบียน (ผู้ใช้) |
| `admin.html` / `admin.js` / `admin.css` | หน้าแอดมิน |
| `config.js` | **ใส่ Supabase credentials ที่นี่** (ใช้ร่วมกันทั้ง 2 หน้า) |
| `closed.html` | หน้า fallback static เมื่อปิดงาน |
| `manifest.json` / `sw.js` / `icon-*.png` | ไฟล์ PWA |
| `supabase-schema.sql` | schema สำหรับติดตั้งใหม่ |
| `supabase-migration-v1-to-v2.sql` | อัปเกรดจาก single-event เดิม |
| `supabase-security-patch.sql` | patch ปิด PII leak (install เก่า) |

## ติดตั้ง

### 1. สร้าง Supabase project
[supabase.com](https://supabase.com) → New project → เลือก region **Singapore** (ใกล้ไทยสุด)

### 2. รัน SQL
SQL Editor → New query → วางเนื้อหาแล้ว Run
- **ติดตั้งใหม่:** `supabase-schema.sql`
- **เคยใช้เวอร์ชันเก่า (single-event):** `supabase-migration-v1-to-v2.sql`
- **เคยรัน schema ก่อนรอบ security:** `supabase-security-patch.sql`

### 3. ใส่ credentials
Project Settings → API → copy **Project URL** และ **anon public key** แล้วแก้ `config.js`:
```js
window.SUPABASE_URL      = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGci...';
```

### 4. สร้างบัญชีแอดมิน
Authentication → Users → **Add user** (email + password) → ใช้ login ที่ `admin.html`

## รันในเครื่อง

ต้องเสิร์ฟผ่าน HTTP server (ไม่ใช่เปิดไฟล์ตรงๆ เพราะ PWA/กล้องต้องการ http/https):
```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```

> **Deploy จริงต้องเป็น HTTPS** — Service Worker และกล้องทำงานเฉพาะบน HTTPS หรือ localhost
> โฮสต์ฟรีที่ใช้ได้ทันที: GitHub Pages, Netlify, Vercel, Cloudflare Pages

## การใช้งาน

### เลือกงาน (multi-event)
- `index.html` → ใช้งานที่ตั้งเป็น **active** ใน admin
- `index.html?event=<EVENT_ID>` → เจาะจงงาน (เปิดหลายงานพร้อมกันได้ — แอดมินจะเห็นลิงก์ของแต่ละงานในหน้า dashboard)

### Kiosk mode
- `index.html?kiosk=1` → หน้า success นับถอยหลังกลับหน้าแรกอัตโนมัติ, แตะที่ไหนก็ไปต่อได้, ไม่ดาวน์โหลดการ์ด

### Whitelist
เปิดสวิตช์ "Whitelist enabled" ในงานนั้น แล้วเพิ่มรายชื่อ → จะรับเฉพาะ Employee ID ที่อยู่ในรายชื่อ

## ความปลอดภัย (RLS)

- `anon key` เปิดเผยใน frontend ได้ตามปกติ — ความปลอดภัยอยู่ที่ Row Level Security
- ตาราง `employees` (ชื่อ/แผนก) และ `registrations` **ปิด public read** — ฝั่งผู้ใช้เช็คผ่าน RPC `is_whitelisted()` / `get_registration_time()` ที่คืนค่าน้อยที่สุด
- เขียน config / whitelist / ลบข้อมูล ทำได้เฉพาะผู้ login (authenticated) เท่านั้น
- ⚠️ การ insert registration เปิดให้ public (anon) — สำหรับงานที่ไม่ไว้ใจ environment แนะนำให้**เปิด whitelist** เป็นด่านกรอง การทำ rate-limit ระดับ IP ต้องใช้ Supabase Edge Function (อยู่นอกขอบเขตเว็บ static)

## หมายเหตุ

- ไม่มีการเก็บรูปถ่าย — บันทึกแค่ Employee ID + เวลา
- เวลาบนการ์ด/หน้าจอแสดงตาม locale ไทย, CSV export เป็น ISO (UTC)
