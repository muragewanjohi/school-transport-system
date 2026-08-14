ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS notify_compliance_alerts BOOLEAN NOT NULL DEFAULT FALSE;
