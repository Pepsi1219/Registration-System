-- ============================================================
-- Security Patch — ปิด PII leak (รันบน install ที่มีอยู่แล้ว)
-- ────────────────────────────────────────────────────────────
-- ปัญหา: policy public_read_* เปิดให้ anon (ที่ฝังใน frontend)
--        ดึงรายชื่อพนักงาน + รายการผู้ลงทะเบียนทั้งหมดได้
-- แก้: ปิด public SELECT, ให้เช็คผ่าน RPC ที่คืนค่าน้อยที่สุด
-- รันทั้งไฟล์ใน SQL Editor ได้เลย (idempotent)
-- ============================================================

-- 1) ปิด public read บน employees / registrations
DROP POLICY IF EXISTS "public_read_employees"     ON employees;
DROP POLICY IF EXISTS "public_read_registrations" ON registrations;

-- 2) ให้แอดมิน (authenticated) อ่านได้ (เผื่อยังไม่มี)
DROP POLICY IF EXISTS "admin_read_employees"    ON employees;
DROP POLICY IF EXISTS "admin_read_registrations" ON registrations;
CREATE POLICY "admin_read_employees"    ON employees     FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_read_registrations" ON registrations FOR SELECT TO authenticated USING (true);

-- 3) RPC สำหรับฝั่ง public
CREATE OR REPLACE FUNCTION public.is_whitelisted(p_event UUID, p_employee TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees WHERE event_id = p_event AND employee_id = p_employee
  );
$$;

CREATE OR REPLACE FUNCTION public.get_registration_time(p_event UUID, p_employee TEXT)
RETURNS TIMESTAMPTZ LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT registered_at FROM registrations
  WHERE event_id = p_event AND employee_id = p_employee LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_whitelisted(UUID, TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_registration_time(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_whitelisted(UUID, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_time(UUID, TEXT) TO anon, authenticated;

-- 4) จำกัดความยาว employee_id (กันข้อมูลขยะ) — ข้ามถ้ามีอยู่แล้ว
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_employee_len') THEN
    ALTER TABLE registrations
      ADD CONSTRAINT registrations_employee_len
      CHECK (char_length(employee_id) BETWEEN 3 AND 32);
  END IF;
END $$;
