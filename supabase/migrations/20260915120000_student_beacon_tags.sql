-- BLE student tag assignments + tenant beacon provisioning config

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS beacon_uuid TEXT,
  ADD COLUMN IF NOT EXISTS beacon_device_password_enc TEXT,
  ADD COLUMN IF NOT EXISTS beacon_provision_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS beacon_next_minor INT DEFAULT 1 NOT NULL;

ALTER TABLE public.tenant_configs DROP CONSTRAINT IF EXISTS tenant_configs_beacon_next_minor_check;
ALTER TABLE public.tenant_configs
  ADD CONSTRAINT tenant_configs_beacon_next_minor_check
  CHECK (beacon_next_minor >= 1 AND beacon_next_minor <= 65535);

CREATE TABLE IF NOT EXISTS public.student_beacon_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  major INT NOT NULL CHECK (major >= 0 AND major <= 65535),
  minor INT NOT NULL CHECK (minor >= 0 AND minor <= 65535),
  mac TEXT,
  device_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS student_beacon_tags_one_active_per_student
  ON public.student_beacon_tags (tenant_id, student_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS student_beacon_tags_one_active_per_identity
  ON public.student_beacon_tags (tenant_id, uuid, major, minor)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS student_beacon_tags_one_active_per_mac
  ON public.student_beacon_tags (tenant_id, mac)
  WHERE status = 'active' AND mac IS NOT NULL AND length(trim(mac)) > 0;

CREATE INDEX IF NOT EXISTS student_beacon_tags_tenant_student_idx
  ON public.student_beacon_tags (tenant_id, student_id);

ALTER TABLE public.student_beacon_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins manage own student beacon tags" ON public.student_beacon_tags;
CREATE POLICY "School Admins manage own student beacon tags" ON public.student_beacon_tags
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

DROP POLICY IF EXISTS "Super Admins manage all student beacon tags" ON public.student_beacon_tags;
CREATE POLICY "Super Admins manage all student beacon tags" ON public.student_beacon_tags
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- Drivers/conductors use service-role via Next.js HMAC routes; no direct client RLS role for them.
