-- Persist demo expiry on the lead row so platform inbox/detail can show it
-- after the is_demo tenant is unlinked or purged.

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
