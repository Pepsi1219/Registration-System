-- ============================================================
-- Event Check-in System — Supabase Schema (v2 · Multi-event)
-- ────────────────────────────────────────────────────────────
-- ติดตั้งใหม่: วาง SQL ทั้งหมดนี้ใน SQL Editor แล้ว Run
-- อัปเกรดจาก v1 (single-event): ใช้ supabase-migration-v1-to-v2.sql แทน
-- ============================================================


-- ============================================================
-- 1. Events — หนึ่งแถวต่อหนึ่งงาน (รองรับหลายงาน)
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_title_line1 TEXT        NOT NULL DEFAULT 'BAU+',
  event_title_line2 TEXT        NOT NULL DEFAULT 'Workshop',
  event_year        TEXT        NOT NULL DEFAULT '2026',
  event_location    TEXT        NOT NULL DEFAULT 'Kanchanaburi',
  event_date        TEXT        NOT NULL DEFAULT '1 - 3 April 2026',
  whitelist_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
  registration_open BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. App Settings — singleton ชี้ว่า "งานไหนคือ active"
-- ใช้เมื่อเปิดแอปแบบไม่มี ?event=<id> ใน URL
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  active_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  CONSTRAINT singleton CHECK (id = 1)
);


-- ============================================================
-- 3. Employees (Whitelist) — แยกตามงาน
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  employee_id TEXT        NOT NULL,
  name        TEXT,
  department  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, employee_id)
);


-- ============================================================
-- 4. Registrations — แยกตามงาน (พนักงาน 1 คน register ได้ 1 ครั้งต่องาน)
-- ============================================================
CREATE TABLE IF NOT EXISTS registrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  employee_id   TEXT        NOT NULL CHECK (char_length(employee_id) BETWEEN 3 AND 32),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_event    ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_employee ON registrations(employee_id);


-- ============================================================
-- 5. Seed — งานเริ่มต้น 1 งาน แล้วตั้งเป็น active
-- ============================================================
INSERT INTO events (id, event_title_line1, event_title_line2, event_year, event_location, event_date, whitelist_enabled, registration_open)
VALUES ('11111111-1111-4111-8111-111111111111', 'BAU+', 'Workshop', '2026', 'Kanchanaburi', '1 - 3 April 2026', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings (id, active_event_id)
VALUES (1, '11111111-1111-4111-8111-111111111111')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- events: ทุกคนอ่านได้ / แอดมินจัดการได้
CREATE POLICY "public_read_events"   ON events FOR SELECT USING (true);
CREATE POLICY "admin_insert_events"  ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_events"  ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_delete_events"  ON events FOR DELETE TO authenticated USING (true);

-- app_settings: ทุกคนอ่านได้ / แอดมินตั้ง active ได้
CREATE POLICY "public_read_settings"  ON app_settings FOR SELECT USING (true);
CREATE POLICY "admin_update_settings" ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_insert_settings" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);

-- employees (whitelist มี PII: ชื่อ/แผนก) → ปิด public read, เหลือแค่แอดมิน
-- ฝั่งลงทะเบียนเช็ค whitelist ผ่าน RPC is_whitelisted() แทน
CREATE POLICY "admin_read_employees"   ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_insert_employees" ON employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_employees" ON employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_delete_employees" ON employees FOR DELETE TO authenticated USING (true);

-- registrations: ปิด public read (กันดึงรายชื่อผู้มางานทั้งหมด)
-- ฝั่งลงทะเบียนเช็คซ้ำผ่าน RPC get_registration_time() / เพิ่มได้ / แอดมินอ่าน+ลบ
CREATE POLICY "public_insert_registrations" ON registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_read_registrations"    ON registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_delete_registrations"  ON registrations FOR DELETE TO authenticated USING (true);


-- ============================================================
-- RPC — ให้ฝั่ง public (anon) เช็คได้โดยไม่ต้องเปิดอ่านทั้งตาราง
-- SECURITY DEFINER: รันด้วยสิทธิ์เจ้าของฟังก์ชัน ข้าม RLS ของตาราง
-- คืนค่าน้อยที่สุด (boolean / timestamp) ไม่รั่ว PII
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_whitelisted(p_event UUID, p_employee TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE event_id = p_event AND employee_id = p_employee
  );
$$;

CREATE OR REPLACE FUNCTION public.get_registration_time(p_event UUID, p_employee TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT registered_at FROM registrations
  WHERE event_id = p_event AND employee_id = p_employee
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_whitelisted(UUID, TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_registration_time(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_whitelisted(UUID, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_time(UUID, TEXT) TO anon, authenticated;


-- ============================================================
-- Realtime — ให้ dashboard อัปเดตยอดทันที
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE registrations;


-- ============================================================
-- สร้างบัญชีแอดมิน:
--   Supabase Dashboard → Authentication → Users → "Add user"
-- ============================================================
