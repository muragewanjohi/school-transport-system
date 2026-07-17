-- Migration to drop foreign key constraint on profiles referencing auth.users
-- This allows creating drivers, conductors, and parents directly in profiles table

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
