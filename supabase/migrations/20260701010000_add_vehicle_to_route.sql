-- Add vehicle_id to public.routes to map a bus directly to a route
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Enable RLS and add policies if needed, although routes is already under RLS.
-- Since routes is already under RLS, any select policy that school_admin can manage is already active.
