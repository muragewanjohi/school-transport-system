-- Phase 1: Schools (tenants) soft-delete, campuses, platform-editable campus fee

-- ---------------------------------------------------------------------------
-- Tenants: soft-delete + contact fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended'));

-- Allow soft-deleted schools to free their domain for reuse
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_domain_key;
DROP INDEX IF EXISTS public.tenants_domain_active_unique;
CREATE UNIQUE INDEX tenants_domain_active_unique
  ON public.tenants (domain)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Campuses (first-class; v1 UI enforces one active campus per tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  location GEOMETRY(Point, 4326),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT campuses_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX IF NOT EXISTS campuses_tenant_id_idx ON public.campuses (tenant_id);
CREATE INDEX IF NOT EXISTS campuses_location_gix ON public.campuses USING GIST (location);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins can manage all Campuses" ON public.campuses;
CREATE POLICY "Super Admins can manage all Campuses" ON public.campuses
  FOR ALL USING (public.jwt_role() = 'super_admin');

DROP POLICY IF EXISTS "School Admins can manage Campuses inside Tenant" ON public.campuses;
CREATE POLICY "School Admins can manage Campuses inside Tenant" ON public.campuses
  FOR ALL USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'school_admin'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO service_role;

-- Seed one default campus for existing tenants that have none
INSERT INTO public.campuses (tenant_id, name, latitude, longitude, location)
SELECT
  t.id,
  t.name || ' Campus',
  -1.2921,
  36.8219,
  ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326)
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campuses c
    WHERE c.tenant_id = t.id AND c.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Optional campus_id on operational tables + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

UPDATE public.students s
SET campus_id = c.id
FROM public.campuses c
WHERE s.tenant_id = c.tenant_id
  AND s.campus_id IS NULL
  AND c.deleted_at IS NULL;

UPDATE public.routes r
SET campus_id = c.id
FROM public.campuses c
WHERE r.tenant_id = c.tenant_id
  AND r.campus_id IS NULL
  AND c.deleted_at IS NULL;

UPDATE public.vehicles v
SET campus_id = c.id
FROM public.campuses c
WHERE v.tenant_id = c.tenant_id
  AND v.campus_id IS NULL
  AND c.deleted_at IS NULL;

UPDATE public.stops st
SET campus_id = c.id
FROM public.campuses c
WHERE st.tenant_id = c.tenant_id
  AND st.campus_id IS NULL
  AND c.deleted_at IS NULL;

UPDATE public.schedules sch
SET campus_id = c.id
FROM public.campuses c
WHERE sch.tenant_id = c.tenant_id
  AND sch.campus_id IS NULL
  AND c.deleted_at IS NULL;

UPDATE public.trips tr
SET campus_id = c.id
FROM public.campuses c
WHERE tr.tenant_id = c.tenant_id
  AND tr.campus_id IS NULL
  AND c.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Admin campus access (ready for multi-campus unlock; not enforced in v1 UI)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS campus_access_mode TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_campus_access_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_campus_access_mode_check
  CHECK (campus_access_mode IN ('all', 'selected'));

CREATE TABLE IF NOT EXISTS public.admin_campus_access (
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (profile_id, campus_id)
);

ALTER TABLE public.admin_campus_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins manage campus access" ON public.admin_campus_access;
CREATE POLICY "Super Admins manage campus access" ON public.admin_campus_access
  FOR ALL USING (public.jwt_role() = 'super_admin');

DROP POLICY IF EXISTS "School Admins manage campus access in tenant" ON public.admin_campus_access;
CREATE POLICY "School Admins manage campus access in tenant" ON public.admin_campus_access
  FOR ALL USING (
    public.jwt_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM public.campuses c
      WHERE c.id = campus_id
        AND c.tenant_id = public.jwt_tenant_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_campus_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_campus_access TO service_role;

-- ---------------------------------------------------------------------------
-- Billing: platform-editable per-campus monthly fee
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_status
  ADD COLUMN IF NOT EXISTS campus_monthly_fee_kes INT NOT NULL DEFAULT 10000;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Super Admins manage platform settings" ON public.platform_settings
  FOR ALL USING (public.jwt_role() = 'super_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO service_role;

INSERT INTO public.platform_settings (key, value)
VALUES ('default_campus_monthly_fee_kes', '10000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Auth sync: platform super_admin keeps tenant_id NULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_role TEXT;
  meta_tenant TEXT;
  resolved_tenant UUID;
BEGIN
  meta_role := COALESCE(nullif(new.raw_user_meta_data->>'role', ''), 'school_admin');
  meta_tenant := nullif(new.raw_user_meta_data->>'tenant_id', '');

  IF meta_role = 'super_admin' THEN
    resolved_tenant := NULL;
  ELSE
    resolved_tenant := COALESCE(
      meta_tenant::UUID,
      '8c9ad841-f762-4217-a021-9876251b5bcf'::UUID
    );
  END IF;

  INSERT INTO public.profiles (id, tenant_id, role, admin_role, name, email, phone, status, campus_access_mode)
  VALUES (
    new.id,
    resolved_tenant,
    meta_role,
    CASE
      WHEN meta_role = 'super_admin' THEN NULL
      ELSE COALESCE(nullif(new.raw_user_meta_data->>'admin_role', ''), 'Super Admin')
    END,
    COALESCE(nullif(new.raw_user_meta_data->>'name', ''), 'Unknown User'),
    new.email,
    COALESCE(new.phone, new.raw_user_meta_data->>'phone'),
    'Available',
    'all'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role,
    admin_role = COALESCE(profiles.admin_role, EXCLUDED.admin_role),
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = COALESCE(profiles.phone, EXCLUDED.phone);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
