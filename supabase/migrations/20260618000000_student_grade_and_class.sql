-- Add grade and class_name to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name TEXT;
