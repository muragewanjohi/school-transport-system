-- Capture prospect country for regional demo qualification

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'Kenya';
