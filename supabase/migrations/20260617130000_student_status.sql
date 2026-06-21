-- Migration to add attendance status to students table

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('Present', 'Absent')) DEFAULT 'Present' NOT NULL;
