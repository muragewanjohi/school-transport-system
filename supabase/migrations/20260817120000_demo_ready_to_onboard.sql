-- School "Request to go live": demo_requests.status ready_to_onboard + request metadata

ALTER TABLE public.demo_requests
  DROP CONSTRAINT IF EXISTS demo_requests_status_check;

ALTER TABLE public.demo_requests
  ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'ready_to_onboard', 'completed', 'declined'));

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS go_live_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS go_live_requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS demo_requests_ready_to_onboard_idx
  ON public.demo_requests (status, go_live_requested_at DESC)
  WHERE status = 'ready_to_onboard';
