-- ============================================================
-- Migration: v1 (single-event) → v2 (multi-event)
-- ────────────────────────────────────────────────────────────
-- ใช้เฉพาะกรณีที่เคยรัน schema v1 (มีตาราง event_config,
-- employees/registrations แบบ employee_id เดี่ยว) ไปแล้ว
--
-- ปลอดภัยต่อข้อมูลเดิม: ย้าย event_config → events 1 แถว
-- แล้วผูกข้อมูลเดิมทั้งหมดเข้ากับงานนั้น
-- รันทั้งไฟล์ใน SQL Editor ได้เลย (idempotent ตามสมควร)
-- ============================================================

-- legacy event ใช้ UUID คงที่เพื่อ backfill ได้แน่นอน
DO $$
DECLARE
  legacy_event UUID := '11111111-1111-4111-8111-111111111111';
BEGIN
  -- 1) events table
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

  -- 2) app_settings singleton
  CREATE TABLE IF NOT EXISTS app_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    active_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    CONSTRAINT singleton CHECK (id = 1)
  );

  -- 3) ย้ายค่าจาก event_config (ถ้ามี) → events 1 แถว
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_config') THEN
    INSERT INTO events (id, event_title_line1, event_title_line2, event_year, event_location, event_date, whitelist_enabled, registration_open)
    SELECT legacy_event, event_title_line1, event_title_line2, event_year, event_location, event_date, whitelist_enabled, registration_open
    FROM event_config WHERE id = 1
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- เผื่อไม่มี event_config ก็ยังมีงานเริ่มต้น
  INSERT INTO events (id) VALUES (legacy_event) ON CONFLICT (id) DO NOTHING;

  INSERT INTO app_settings (id, active_event_id)
  VALUES (1, legacy_event) ON CONFLICT (id) DO NOTHING;

  -- 4) registrations: เพิ่ม event_id + backfill + ปรับ constraint
  ALTER TABLE registrations ADD COLUMN IF NOT EXISTS event_id UUID;
  UPDATE registrations SET event_id = legacy_event WHERE event_id IS NULL;
  ALTER TABLE registrations ALTER COLUMN event_id SET NOT NULL;

  -- ลบ UNIQUE เดิมบน employee_id (ชื่อ default = registrations_employee_id_key)
  ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_employee_id_key;
  -- เพิ่ม UNIQUE ใหม่แบบต่อ-งาน
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registrations_event_employee_key'
  ) THEN
    ALTER TABLE registrations
      ADD CONSTRAINT registrations_event_employee_key UNIQUE (event_id, employee_id);
  END IF;

  ALTER TABLE registrations
    ADD CONSTRAINT registrations_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    NOT VALID;

  -- 5) employees: เพิ่ม event_id + backfill + เปลี่ยน PK เป็น (event_id, employee_id)
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS event_id UUID;
  UPDATE employees SET event_id = legacy_event WHERE event_id IS NULL;
  ALTER TABLE employees ALTER COLUMN event_id SET NOT NULL;

  ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_pkey;
  ALTER TABLE employees ADD PRIMARY KEY (event_id, employee_id);
  ALTER TABLE employees
    ADD CONSTRAINT employees_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_registrations_event    ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_employee ON registrations(employee_id);

-- ── RLS สำหรับตารางใหม่ ────────────────────────────────────
ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_events"  ON events;
DROP POLICY IF EXISTS "admin_insert_events" ON events;
DROP POLICY IF EXISTS "admin_update_events" ON events;
DROP POLICY IF EXISTS "admin_delete_events" ON events;
CREATE POLICY "public_read_events"  ON events FOR SELECT USING (true);
CREATE POLICY "admin_insert_events" ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_events" ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_delete_events" ON events FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "public_read_settings"  ON app_settings;
DROP POLICY IF EXISTS "admin_update_settings" ON app_settings;
DROP POLICY IF EXISTS "admin_insert_settings" ON app_settings;
CREATE POLICY "public_read_settings"  ON app_settings FOR SELECT USING (true);
CREATE POLICY "admin_update_settings" ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_insert_settings" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);

-- หมายเหตุ: ตาราง event_config เดิมไม่ได้ถูกลบ — เมื่อมั่นใจว่าย้ายครบแล้ว
-- ลบได้ด้วย:  DROP TABLE event_config;
