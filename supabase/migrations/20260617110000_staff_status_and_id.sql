-- Add status and national_id columns to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Apply check constraint for status values
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('Available', 'Unavailable'));
