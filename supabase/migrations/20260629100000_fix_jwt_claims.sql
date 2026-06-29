-- Fix public.jwt_role() to read the custom application role from the user_metadata claim in the request JWT
CREATE OR REPLACE FUNCTION public.jwt_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role', ''), 
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$ LANGUAGE sql STABLE;

-- Fix public.jwt_tenant_id() to read the tenant UUID from user_metadata or root claims in the request JWT
CREATE OR REPLACE FUNCTION public.jwt_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'tenant_id', ''), 
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', ''),
    NULL
  )::UUID;
$$ LANGUAGE sql STABLE;

-- Drop old check constraint and recreate it to permit the new 'Operations Admin' and 'Bursar' roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_admin_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_admin_role_check CHECK (
  admin_role IN ('Super Admin', 'Operations Admin', 'Bursar', 'Dispatcher', 'Fleet Manager', 'Roster Manager')
);
