-- Guardian-aware parent RLS + profile column guard
-- Spec: context/architecture.md — "Parent ownership in RLS" and "Profile column guard".
--
-- 1) A parent's "own children" now include students where their verified phone is
--    in students.guardians (secondary guardians), not only students.parent_id.
-- 2) End users can no longer change privileged profile columns (role, phone, …).
--    profiles.role drives dashboard authorization and profiles.phone drives (1),
--    so both must be server-controlled. Previously "Users can access own Profile"
--    (FOR ALL, id = auth.uid()) let any signed-in user rewrite them.

-- ---------------------------------------------------------------------------
-- Phone matching (mirrors guardianPhonesMatch in src/lib/studentGuardians.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.canonical_phone_digits(phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN d LIKE '0%' AND length(d) >= 9 THEN '254' || substr(d, 2)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS d) AS x;
$$;

CREATE OR REPLACE FUNCTION public.guardian_phones_match(left_phone TEXT, right_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN a = '' OR b = '' THEN false
    WHEN a = b THEN true
    WHEN length(a) >= 9 AND length(b) >= 9 THEN right(a, length(b)) = b OR right(b, length(a)) = a
    ELSE false
  END
  FROM (
    SELECT public.canonical_phone_digits(left_phone) AS a,
           public.canonical_phone_digits(right_phone) AS b
  ) AS x;
$$;

-- ---------------------------------------------------------------------------
-- Ownership helpers. SECURITY DEFINER so policies on students can call them
-- without recursing into students' own RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parent_student_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id
  FROM public.students s
  WHERE s.parent_id = auth.uid()
  UNION
  SELECT s.id
  FROM public.profiles p
  JOIN public.students s ON s.tenant_id = p.tenant_id
  WHERE p.id = auth.uid()
    AND p.role = 'parent'
    AND p.phone IS NOT NULL
    AND jsonb_typeof(s.guardians) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(s.guardians) AS g
      WHERE jsonb_typeof(g) = 'object'
        AND public.guardian_phones_match(g->>'phone', p.phone)
    );
$$;

CREATE OR REPLACE FUNCTION public.parent_route_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT s.route_id
  FROM public.students s
  WHERE s.id IN (SELECT public.parent_student_ids())
    AND s.route_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.parent_student_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parent_route_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_student_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parent_route_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Parent SELECT policies: same names and role/tenant checks, ownership swapped
-- from "parent_id = auth.uid()" to the guardian-aware helpers.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Parents can view their own children records" ON public.students;
CREATE POLICY "Parents can view their own children records" ON public.students
  FOR SELECT USING (id IN (SELECT public.parent_student_ids()));

DROP POLICY IF EXISTS "Parents can read Routes of their children" ON public.routes;
CREATE POLICY "Parents can read Routes of their children" ON public.routes
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND id IN (SELECT public.parent_route_ids())
  );

DROP POLICY IF EXISTS "Parents can view live coordinates for child's active route" ON public.live_coordinates;
CREATE POLICY "Parents can view live coordinates for child's active route" ON public.live_coordinates
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT public.parent_route_ids())
  );

DROP POLICY IF EXISTS "Parents can read geofences mapped to their children" ON public.geofences;
CREATE POLICY "Parents can read geofences mapped to their children" ON public.geofences
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT public.parent_student_ids())
  );

DROP POLICY IF EXISTS "Parents can view alerts sent for their children" ON public.sent_proximity_alerts;
CREATE POLICY "Parents can view alerts sent for their children" ON public.sent_proximity_alerts
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT public.parent_student_ids())
  );

DROP POLICY IF EXISTS "Parents can view trip stop ETAs for child's active route" ON public.trip_stop_etas;
CREATE POLICY "Parents can view trip stop ETAs for child's active route" ON public.trip_stop_etas
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT public.parent_route_ids())
  );

DROP POLICY IF EXISTS "Parents can read stops on child's route" ON public.stops;
CREATE POLICY "Parents can read stops on child's route" ON public.stops
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT public.parent_route_ids())
  );

DROP POLICY IF EXISTS "Parents can view trips for child's routes" ON public.trips;
CREATE POLICY "Parents can view trips for child's routes" ON public.trips
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT public.parent_route_ids())
  );

DROP POLICY IF EXISTS "Parents can read schedules on child's route" ON public.schedules;
CREATE POLICY "Parents can read schedules on child's route" ON public.schedules
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT public.parent_route_ids())
  );

-- "Parents can update their own children" (UPDATE) intentionally stays primary-only.

-- ---------------------------------------------------------------------------
-- Profile column guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims JSONB := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  request_role TEXT := coalesce(claims->>'role', '');
  -- app_metadata only: user_metadata is editable by the user
  app_role TEXT := coalesce(claims->'app_metadata'->>'role', '');
BEGIN
  -- Service role, migrations and internal (no JWT) connections are trusted
  IF claims IS NULL OR request_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF app_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF app_role = 'school_admin' THEN
    IF NEW.role = 'super_admin'
       AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'super_admin') THEN
      RAISE EXCEPTION 'School admins cannot grant platform super_admin'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Profiles can only be created by the server'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.admin_role IS DISTINCT FROM OLD.admin_role
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.otp_code IS DISTINCT FROM OLD.otp_code
     OR NEW.otp_expires_at IS DISTINCT FROM OLD.otp_expires_at
  THEN
    RAISE EXCEPTION 'This profile field can only be changed by your school'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
