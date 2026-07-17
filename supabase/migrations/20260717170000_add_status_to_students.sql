-- Migration to add status column to public.students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Present' NOT NULL CHECK (status IN ('Present', 'Absent'));
