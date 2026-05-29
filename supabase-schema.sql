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
  employee_id   TEXT        NOT NULL,
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

-- employees: ทุกคนอ่านได้ (whitelist check) / แอดมินจัดการได้
CREATE POLICY "public_read_employees"  ON employees FOR SELECT USING (true);
CREATE POLICY "admin_insert_employees" ON employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_employees" ON employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_delete_employees" ON employees FOR DELETE TO authenticated USING (true);

-- registrations: ทุกคนอ่าน + เพิ่มได้ / แอดมินลบได้
CREATE POLICY "public_read_registrations"   ON registrations FOR SELECT USING (true);
CREATE POLICY "public_insert_registrations" ON registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_delete_registrations"  ON registrations FOR DELETE TO authenticated USING (true);


-- ============================================================
-- Realtime — ให้ dashboard อัปเดตยอดทันที
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE registrations;


-- ============================================================
-- สร้างบัญชีแอดมิน:
--   Supabase Dashboard → Authentication → Users → "Add user"
-- ============================================================
