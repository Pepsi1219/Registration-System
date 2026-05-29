-- ============================================================
-- Event Check-in System — Supabase Database Schema
-- วิธีใช้: เปิด Supabase Dashboard → SQL Editor → New query
--          วาง SQL ทั้งหมดนี้แล้วกด Run
-- ============================================================


-- ============================================================
-- 1. Event Configuration
-- แอดมินตั้งค่างานได้จาก Table Editor ใน Supabase Dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS event_config (
  id                INTEGER  PRIMARY KEY DEFAULT 1,
  event_title_line1 TEXT     NOT NULL DEFAULT 'BAU+',
  event_title_line2 TEXT     NOT NULL DEFAULT 'Workshop',
  event_year        TEXT     NOT NULL DEFAULT '2026',
  event_location    TEXT     NOT NULL DEFAULT 'Kanchanaburi',
  event_date        TEXT     NOT NULL DEFAULT '1 - 3 April 2026',
  whitelist_enabled BOOLEAN  NOT NULL DEFAULT FALSE,
  registration_open BOOLEAN  NOT NULL DEFAULT TRUE
);

-- ค่าเริ่มต้น (จะไม่ทับข้อมูลถ้ามีอยู่แล้ว)
INSERT INTO event_config
  (id, event_title_line1, event_title_line2, event_year, event_location, event_date, whitelist_enabled, registration_open)
VALUES
  (1, 'BAU+', 'Workshop', '2026', 'Kanchanaburi', '1 - 3 April 2026', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. Employee Whitelist
-- ใช้เมื่อ whitelist_enabled = TRUE ใน event_config
-- เพิ่มรายชื่อพนักงานที่ได้รับอนุญาตให้ลงทะเบียนที่นี่
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT        PRIMARY KEY,
  name        TEXT,
  department  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 3. Registrations
-- บันทึกการลงทะเบียนทุกครั้ง (UNIQUE บน employee_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS registrations (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   TEXT        NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- Row Level Security (RLS)
-- anon key (ใน frontend) อ่านได้ทุก table
-- เขียนได้เฉพาะ registrations เท่านั้น
-- ============================================================
ALTER TABLE event_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- event_config: อ่านอย่างเดียว
CREATE POLICY "public_read_event_config"
  ON event_config FOR SELECT USING (true);

-- employees: อ่านอย่างเดียว (สำหรับ whitelist check)
CREATE POLICY "public_read_employees"
  ON employees FOR SELECT USING (true);

-- registrations: อ่าน + เพิ่มได้ (ห้ามแก้/ลบ)
CREATE POLICY "public_read_registrations"
  ON registrations FOR SELECT USING (true);

CREATE POLICY "public_insert_registrations"
  ON registrations FOR INSERT WITH CHECK (true);


-- ============================================================
-- Admin Policies (สำหรับผู้ใช้ที่ login ผ่าน Supabase Auth)
-- authenticated user แก้ config / จัดการ whitelist / ลบ registration ได้
-- ============================================================

-- event_config: แอดมินแก้ไขได้
CREATE POLICY "admin_update_event_config"
  ON event_config FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "admin_insert_event_config"
  ON event_config FOR INSERT TO authenticated
  WITH CHECK (true);

-- employees: แอดมินเพิ่ม / ลบ whitelist ได้
CREATE POLICY "admin_insert_employees"
  ON employees FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "admin_update_employees"
  ON employees FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "admin_delete_employees"
  ON employees FOR DELETE TO authenticated
  USING (true);

-- registrations: แอดมินลบได้ (เผื่อแก้ไขข้อมูลผิด)
CREATE POLICY "admin_delete_registrations"
  ON registrations FOR DELETE TO authenticated
  USING (true);


-- ============================================================
-- Realtime
-- เปิด realtime ให้ตาราง registrations เพื่อให้ dashboard
-- อัปเดตยอดทันทีเมื่อมีคนลงทะเบียน
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE registrations;


-- ============================================================
-- สร้างบัญชีแอดมิน:
--   Supabase Dashboard → Authentication → Users → "Add user"
--   กรอก email + password → ใช้ login ที่หน้า admin.html
-- ============================================================
