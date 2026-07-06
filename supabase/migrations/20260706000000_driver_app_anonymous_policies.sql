-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public read of routes" ON public.routes;
DROP POLICY IF EXISTS "Allow public read of schedules" ON public.schedules;
DROP POLICY IF EXISTS "Allow public read of stops" ON public.stops;
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
DROP POLICY IF EXISTS "Allow public update of students" ON public.students;
DROP POLICY IF EXISTS "Allow public insert of live_coordinates" ON public.live_coordinates;

-- Create additional SELECT policies to allow anonymous reads on transit metadata tables
CREATE POLICY "Allow public read of routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Allow public read of schedules" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Allow public read of stops" ON public.stops FOR SELECT USING (true);
CREATE POLICY "Allow public read of students" ON public.students FOR SELECT USING (true);

-- Create additional UPDATE policy to allow the driver app (operating anonymously) to update student status
CREATE POLICY "Allow public update of students" ON public.students FOR UPDATE USING (true) WITH CHECK (true);

-- Create additional INSERT policy to allow the driver app (operating anonymously) to stream telemetry
CREATE POLICY "Allow public insert of live_coordinates" ON public.live_coordinates FOR INSERT WITH CHECK (true);
