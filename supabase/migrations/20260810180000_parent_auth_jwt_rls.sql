-- Parent Supabase Auth JWT support:
-- 1) Prefer app_metadata for role/tenant claims (parents set both app + user metadata).
-- 2) Allow parents to SELECT stops on their children's routes (needed for map polylines).

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'tenant_id', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'tenant_id', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', ''),
    NULL
  )::UUID;
$$;

DROP POLICY IF EXISTS "Parents can read stops on child's route" ON public.stops;
CREATE POLICY "Parents can read stops on child's route" ON public.stops
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );
