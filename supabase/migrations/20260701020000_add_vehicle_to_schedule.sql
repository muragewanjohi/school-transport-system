-- 1. Drop vehicle_id from public.routes since one route can have multiple buses (schedules)
ALTER TABLE public.routes DROP COLUMN IF EXISTS vehicle_id;

-- 2. Add vehicle_id to public.schedules to map a bus (vehicle) to a specific run schedule
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;
