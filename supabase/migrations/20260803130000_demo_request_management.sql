-- Demo request sales workflow and Demo Viewer role support

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.demo_requests
  DROP CONSTRAINT IF EXISTS demo_requests_status_check;

ALTER TABLE public.demo_requests
  ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'declined'));

CREATE INDEX IF NOT EXISTS demo_requests_status_created_idx
  ON public.demo_requests (status, created_at DESC);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_admin_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_admin_role_check
  CHECK (
    admin_role IS NULL OR admin_role IN (
      'Super Admin',
      'Operations Admin',
      'Bursar',
      'Dispatcher',
      'Fleet Manager',
      'Roster Manager',
      'Demo Viewer'
    )
  );
