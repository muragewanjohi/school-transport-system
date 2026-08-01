-- Tenant lifecycle: retention periods for suspended and soft-deleted schools.
-- Suspended schools are auto soft-deleted after `suspended_purge_days`;
-- soft-deleted schools are permanently purged after `deleted_purge_days`.
-- Purge is executed by the platform API (Vercel Cron -> /api/platform/purge).

-- Track when a tenant entered the suspended state
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;

-- Backfill: currently suspended tenants start their clock now
UPDATE public.tenants
SET suspended_at = timezone('utc'::text, now())
WHERE status = 'suspended'
  AND suspended_at IS NULL;

-- Retention settings (days; 0 disables the stage)
INSERT INTO public.platform_settings (key, value)
VALUES
  ('suspended_purge_days', '90'::jsonb),
  ('deleted_purge_days', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
