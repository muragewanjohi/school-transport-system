-- Add admin_role column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_role TEXT;

-- Apply check constraint for admin_role values
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_admin_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_admin_role_check CHECK (admin_role IN ('Super Admin', 'Operations Admin', 'Bursar', 'Dispatcher', 'Fleet Manager', 'Roster Manager'));

-- Update existing school_admin users to default to 'Super Admin' if null
UPDATE public.profiles 
SET admin_role = 'Super Admin' 
WHERE role = 'school_admin' AND admin_role IS NULL;
