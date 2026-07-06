-- Migration to allow anonymous/public student insert and delete operations
-- This enables the development admin console to perform student management without auth session tokens

-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public insert of students" ON public.students;
DROP POLICY IF EXISTS "Allow public delete of students" ON public.students;

-- Create policies to allow public INSERT and DELETE
CREATE POLICY "Allow public insert of students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete of students" ON public.students FOR DELETE USING (true);
