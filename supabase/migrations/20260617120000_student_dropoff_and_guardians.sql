-- Migration to add drop-off location and multiple guardians support to students table

-- 1. Add dropoff_location GEOMETRY Point column if it doesn't exist
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS dropoff_location GEOMETRY(Point, 4326);

-- 2. Add guardians JSONB column if it doesn't exist
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS guardians JSONB DEFAULT '[]'::jsonb;

-- 3. Create GIST index for dropoff_location for spatial queries
CREATE INDEX IF NOT EXISTS idx_students_dropoff ON public.students USING GIST (dropoff_location);
