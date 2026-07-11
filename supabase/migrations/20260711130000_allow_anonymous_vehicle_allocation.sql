-- Migration to allow anonymous/public vehicle select, insert, update, and delete
-- This enables the development admin console to perform vehicle and driver allocation without auth session tokens

-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public read of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public insert of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public update of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public delete of vehicles" ON public.vehicles;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE
CREATE POLICY "Allow public read of vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Allow public insert of vehicles" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of vehicles" ON public.vehicles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete of vehicles" ON public.vehicles FOR DELETE USING (true);

-- Drop policies for trips if they exist
DROP POLICY IF EXISTS "Allow public read of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public delete of trips" ON public.trips;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE on trips
CREATE POLICY "Allow public read of trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Allow public insert of trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of trips" ON public.trips FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete of trips" ON public.trips FOR DELETE USING (true);

-- Drop policies for trip manifests if they exist
DROP POLICY IF EXISTS "Allow public read of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public insert of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public update of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public delete of trip_manifests" ON public.trip_manifests;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE on trip_manifests
CREATE POLICY "Allow public read of trip_manifests" ON public.trip_manifests FOR SELECT USING (true);
CREATE POLICY "Allow public insert of trip_manifests" ON public.trip_manifests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update of trip_manifests" ON public.trip_manifests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete of trip_manifests" ON public.trip_manifests FOR DELETE USING (true);
