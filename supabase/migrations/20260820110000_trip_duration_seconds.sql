ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

COMMENT ON COLUMN public.trips.duration_seconds IS
  'Trip length in seconds from started_at to completed_at.';
