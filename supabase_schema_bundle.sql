-- ========================================================
-- BUNDLED DATABASE MIGRATIONS FOR SAFARICOM TRACK
-- Generated: 2026-07-22T11:52:54.270Z
-- ========================================================

-- --------------------------------------------------------
-- MIGRATION: 20260613000000_init_schema.sql
-- --------------------------------------------------------

-- Enable PostGIS extension for spatial computations
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Tenants Table (Isolated School Entities)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Profiles Table (Auth Sync, Multi-role Support)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'driver', 'parent')),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Vehicles Table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    license_plate TEXT NOT NULL,
    model TEXT NOT NULL,
    active_driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Routes Table (Paths are stored as geometries)
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    path GEOMETRY(LineString, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    pickup_location GEOMETRY(Point, 4326),
    nfc_card_hash TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Live Coordinates (Realtime Telemetry Ingestion)
CREATE TABLE IF NOT EXISTS public.live_coordinates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    speed NUMERIC,
    bearing NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Geofences Table (Geofence zones surrounding student home coordinates)
CREATE TABLE IF NOT EXISTS public.geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE NOT NULL,
    boundary GEOMETRY(Polygon, 4326) NOT NULL,
    radius_meters NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Sent Proximity Alerts Table (Avoids SMS spam triggers)
CREATE TABLE IF NOT EXISTS public.sent_proximity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    trip_date DATE DEFAULT CURRENT_DATE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_alert_per_day UNIQUE (student_id, trip_date)
);

-- 9. Alerts Queue Table (Transactional Database Webhook Target)
CREATE TABLE IF NOT EXISTS public.alerts_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('proximity', 'boarding', 'dropoff')),
    processed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Spatial Indexes for Fast Spatial Query Resolution
CREATE INDEX IF NOT EXISTS idx_routes_path ON public.routes USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_students_pickup ON public.students USING GIST (pickup_location);
CREATE INDEX IF NOT EXISTS idx_live_coordinates_coords ON public.live_coordinates USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_geofences_boundary ON public.geofences USING GIST (boundary);

-- Add Supabase Realtime configuration for live coordinate streaming
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'live_coordinates'
  ) then
    alter publication supabase_realtime add table public.live_coordinates;
  end if;
end;
$$;

-- DB Function: Auto-populate Profiles on User Creation (Supabase Auth Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, role, name, email, phone)
  VALUES (
    new.id,
    (new.raw_user_meta_data->>'tenant_id')::UUID,
    new.raw_user_meta_data->>'role',
    COALESCE(new.raw_user_meta_data->>'name', 'Unknown User'),
    new.email,
    new.phone
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DB Function: Spatial Geofence Intersection Checker & SMS Queue dispatcher
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  alert_exists BOOLEAN;
BEGIN
  -- Query active student locations along the route intersecting with coordinates
  FOR student_row IN
    SELECT s.id as student_id, s.parent_id, p.phone as parent_phone
    FROM public.students s
    JOIN public.profiles p ON s.parent_id = p.id
    JOIN public.geofences g ON g.student_id = s.id
    WHERE s.route_id = new.route_id
      AND ST_Contains(g.boundary, new.coordinates)
  LOOP
    -- Check if an alert was already sent for this student today
    SELECT EXISTS (
      SELECT 1 FROM public.sent_proximity_alerts
      WHERE student_id = student_row.student_id
        AND trip_date = CURRENT_DATE
    ) INTO alert_exists;

    -- Trigger and Queue SMS if not already warned
    IF NOT alert_exists THEN
      INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
      VALUES (new.tenant_id, student_row.student_id, CURRENT_DATE)
      ON CONFLICT (student_id, trip_date) DO NOTHING;

      INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type)
      VALUES (new.tenant_id, student_row.student_id, student_row.parent_id, 'proximity');
    END IF;
  END LOOP;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_live_coordinate_ingested
  AFTER INSERT ON public.live_coordinates
  FOR EACH ROW EXECUTE FUNCTION public.check_geofence_triggers();

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS across all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_coordinates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sent_proximity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_queue ENABLE ROW LEVEL SECURITY;

-- Utility Functions to parse JWT profiles (Performance Optimized)
CREATE OR REPLACE FUNCTION public.jwt_role() RETURNS TEXT AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.jwt_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', ''), NULL)::UUID;
$$ LANGUAGE sql STABLE;

-- Tenants Policies
DROP POLICY IF EXISTS "Super Admins can manage all Tenants" ON public.tenants;
CREATE POLICY "Super Admins can manage all Tenants" ON public.tenants
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Tenant Admins can view own Tenant details" ON public.tenants;
CREATE POLICY "Tenant Admins can view own Tenant details" ON public.tenants
  FOR SELECT USING (id = public.jwt_tenant_id());

-- Profiles Policies
DROP POLICY IF EXISTS "Users can access own Profile" ON public.profiles;
CREATE POLICY "Users can access own Profile" ON public.profiles
  FOR ALL USING (id = auth.uid());
DROP POLICY IF EXISTS "School Admins can manage profiles inside Tenant" ON public.profiles;
CREATE POLICY "School Admins can manage profiles inside Tenant" ON public.profiles
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage all Profiles" ON public.profiles;
CREATE POLICY "Super Admins can manage all Profiles" ON public.profiles
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Drivers can view Parent contacts inside Tenant" ON public.profiles;
CREATE POLICY "Drivers can view Parent contacts inside Tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
DROP POLICY IF EXISTS "Parents can view Driver profiles inside Tenant" ON public.profiles;
CREATE POLICY "Parents can view Driver profiles inside Tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'parent');

-- Vehicles Policies
DROP POLICY IF EXISTS "School Admins can manage Vehicles inside Tenant" ON public.vehicles;
CREATE POLICY "School Admins can manage Vehicles inside Tenant" ON public.vehicles
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage all Vehicles" ON public.vehicles;
CREATE POLICY "Super Admins can manage all Vehicles" ON public.vehicles
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Drivers can read vehicles inside Tenant" ON public.vehicles;
CREATE POLICY "Drivers can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
DROP POLICY IF EXISTS "Parents can read vehicles inside Tenant" ON public.vehicles;
CREATE POLICY "Parents can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
  );

-- Routes Policies
DROP POLICY IF EXISTS "School Admins can manage Routes inside Tenant" ON public.routes;
CREATE POLICY "School Admins can manage Routes inside Tenant" ON public.routes
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage all Routes" ON public.routes;
CREATE POLICY "Super Admins can manage all Routes" ON public.routes
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Drivers can read Routes inside Tenant" ON public.routes;
CREATE POLICY "Drivers can read Routes inside Tenant" ON public.routes
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
DROP POLICY IF EXISTS "Parents can read Routes of their children" ON public.routes;
CREATE POLICY "Parents can read Routes of their children" ON public.routes
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );

-- Students Policies
DROP POLICY IF EXISTS "School Admins can manage Students inside Tenant" ON public.students;
CREATE POLICY "School Admins can manage Students inside Tenant" ON public.students
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage all Students" ON public.students;
CREATE POLICY "Super Admins can manage all Students" ON public.students
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Drivers can read active checklists of assigned Routes" ON public.students;
CREATE POLICY "Drivers can read active checklists of assigned Routes" ON public.students
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
DROP POLICY IF EXISTS "Parents can view their own children records" ON public.students;
CREATE POLICY "Parents can view their own children records" ON public.students
  FOR SELECT USING (parent_id = auth.uid());

-- Live Coordinates Policies
DROP POLICY IF EXISTS "Drivers can stream telemetry coordinates" ON public.live_coordinates;
CREATE POLICY "Drivers can stream telemetry coordinates" ON public.live_coordinates
  FOR INSERT WITH CHECK (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'driver'
  );
DROP POLICY IF EXISTS "School Admins can view telemetry coordinates inside Tenant" ON public.live_coordinates;
CREATE POLICY "School Admins can view telemetry coordinates inside Tenant" ON public.live_coordinates
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can view all telemetry" ON public.live_coordinates;
CREATE POLICY "Super Admins can view all telemetry" ON public.live_coordinates
  FOR SELECT USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Parents can view live coordinates for child's active route" ON public.live_coordinates;
CREATE POLICY "Parents can view live coordinates for child's active route" ON public.live_coordinates
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );

-- Geofences Policies
DROP POLICY IF EXISTS "School Admins can manage Geofences inside Tenant" ON public.geofences;
CREATE POLICY "School Admins can manage Geofences inside Tenant" ON public.geofences
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage all Geofences" ON public.geofences;
CREATE POLICY "Super Admins can manage all Geofences" ON public.geofences
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Parents can read geofences mapped to their children" ON public.geofences;
CREATE POLICY "Parents can read geofences mapped to their children" ON public.geofences
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

-- Sent Proximity Alerts Policies
DROP POLICY IF EXISTS "School Admins can view historical dispatches" ON public.sent_proximity_alerts;
CREATE POLICY "School Admins can view historical dispatches" ON public.sent_proximity_alerts
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage alerts logs" ON public.sent_proximity_alerts;
CREATE POLICY "Super Admins can manage alerts logs" ON public.sent_proximity_alerts
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Parents can view alerts sent for their children" ON public.sent_proximity_alerts;
CREATE POLICY "Parents can view alerts sent for their children" ON public.sent_proximity_alerts
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

-- Alerts Queue Policies
DROP POLICY IF EXISTS "Database Triggers can write alerts" ON public.alerts_queue;
CREATE POLICY "Database Triggers can write alerts" ON public.alerts_queue
  FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "Edge functions / Webhooks can read & process queues" ON public.alerts_queue;
CREATE POLICY "Edge functions / Webhooks can read & process queues" ON public.alerts_queue
  FOR ALL USING (public.jwt_role() = 'super_admin');


-- --------------------------------------------------------
-- MIGRATION: 20260616120000_add_webhook_trigger.sql
-- --------------------------------------------------------

-- Enable pg_net extension to support asynchronous HTTP request execution
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Database trigger function to invoke the send-sms Edge Function
CREATE OR REPLACE FUNCTION public.trigger_alert_webhook()
RETURNS TRIGGER AS $$
DECLARE
  request_host TEXT;
  webhook_url TEXT;
BEGIN
  -- Extract hostname from request headers if available
  BEGIN
    request_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION
    WHEN OTHERS THEN
      request_host := NULL;
  END;

  -- Default to user's production project reference if host headers are absent
  IF request_host IS NULL OR request_host = '' THEN
    request_host := 'nxhccqbvjrxqqfvpfcmx.supabase.co';
  END IF;

  -- Map local development connections to local Docker container gateway, 
  -- and hosted connections to the production project API URL
  IF request_host LIKE 'localhost%' OR request_host LIKE '127.0.0.1%' OR request_host LIKE '54321%' THEN
    webhook_url := 'http://kong:8000/functions/v1/send-sms';
  ELSE
    -- Ensure schema is attached if request_host is just the domain ref
    IF request_host NOT LIKE 'http%' THEN
      webhook_url := 'https://' || request_host || '/functions/v1/send-sms';
    ELSE
      webhook_url := request_host || '/functions/v1/send-sms';
    END IF;
  END IF;

  -- Invoke the Edge Function asynchronously via pg_net
  BEGIN
    PERFORM extensions.net_http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('private.keys.service_role', true), '')
      ),
      body := jsonb_build_object('record', row_to_json(new)),
      timeout_ms := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log exception as warning to prevent database inserts from failing 
      -- due to offline environments or network timeout latency
      RAISE WARNING 'Failed to trigger alerts_queue SMS webhook: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to alerts_queue INSERT execution
CREATE OR REPLACE TRIGGER on_alert_queued
  AFTER INSERT ON public.alerts_queue
  FOR EACH ROW EXECUTE FUNCTION public.trigger_alert_webhook();


-- --------------------------------------------------------
-- MIGRATION: 20260617100000_fleet_management.sql
-- --------------------------------------------------------

-- Alter profiles check constraint to allow 'conductor' role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'school_admin', 'driver', 'parent', 'conductor'));

-- Extend Vehicles Table with Fleet Management attributes
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fuel_level INTEGER DEFAULT 100;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer NUMERIC DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS last_service_date DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE;

-- Conductor assignments (A bus can have up to 2 conductors)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS conductor_1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS conductor_2_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Re-apply check constraints to the extended vehicles columns
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_status_check CHECK (status IN ('Active', 'Maintenance', 'Out of Service'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_fuel_level_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_fuel_level_check CHECK (fuel_level >= 0 AND fuel_level <= 100);

-- Enable RLS and add Conductor read policies to vehicles
DROP POLICY IF EXISTS "Conductors can read vehicles inside Tenant" ON public.vehicles;
CREATE POLICY "Conductors can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'conductor'
  );

-- Create Maintenance Logs Table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    cost NUMERIC,
    service_date DATE DEFAULT CURRENT_DATE NOT NULL,
    technician TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on maintenance_logs
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Configure RLS Policies for maintenance_logs
DROP POLICY IF EXISTS "School Admins can manage Maintenance Logs inside Tenant" ON public.maintenance_logs;
CREATE POLICY "School Admins can manage Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

DROP POLICY IF EXISTS "Super Admins can manage all Maintenance Logs" ON public.maintenance_logs;
CREATE POLICY "Super Admins can manage all Maintenance Logs" ON public.maintenance_logs
  FOR ALL USING (public.jwt_role() = 'super_admin');

DROP POLICY IF EXISTS "Drivers can read Maintenance Logs inside Tenant" ON public.maintenance_logs;
CREATE POLICY "Drivers can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');

DROP POLICY IF EXISTS "Conductors can read Maintenance Logs inside Tenant" ON public.maintenance_logs;
CREATE POLICY "Conductors can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'conductor');

DROP POLICY IF EXISTS "Parents can read Maintenance Logs inside Tenant" ON public.maintenance_logs;
CREATE POLICY "Parents can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
  );

-- Create index on vehicle_id in maintenance_logs for query optimization
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_vehicle_id ON public.maintenance_logs(vehicle_id);


-- --------------------------------------------------------
-- MIGRATION: 20260617110000_staff_status_and_id.sql
-- --------------------------------------------------------

-- Add status and national_id columns to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Apply check constraint for status values
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('Available', 'Unavailable'));


-- --------------------------------------------------------
-- MIGRATION: 20260617120000_student_dropoff_and_guardians.sql
-- --------------------------------------------------------

-- Migration to add drop-off location and multiple guardians support to students table

-- 1. Add dropoff_location GEOMETRY Point column if it doesn't exist
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS dropoff_location GEOMETRY(Point, 4326);

-- 2. Add guardians JSONB column if it doesn't exist
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS guardians JSONB DEFAULT '[]'::jsonb;

-- 3. Create GIST index for dropoff_location for spatial queries
CREATE INDEX IF NOT EXISTS idx_students_dropoff ON public.students USING GIST (dropoff_location);


-- --------------------------------------------------------
-- MIGRATION: 20260617130000_student_status.sql
-- --------------------------------------------------------

-- Migration to add attendance status to students table

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('Present', 'Absent')) DEFAULT 'Present' NOT NULL;


-- --------------------------------------------------------
-- MIGRATION: 20260618000000_student_grade_and_class.sql
-- --------------------------------------------------------

-- Add grade and class_name to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name TEXT;


-- --------------------------------------------------------
-- MIGRATION: 20260618120000_multi_session_routes_and_stops.sql
-- --------------------------------------------------------

-- 1. Create ENUM transit direction if not exists
DO $$ BEGIN
    CREATE TYPE public.transit_direction AS ENUM ('HOME_TO_SCHOOL', 'SCHOOL_TO_HOME');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create ENUM stop type if not exists
DO $$ BEGIN
    CREATE TYPE public.stop_type AS ENUM ('PICKUP', 'DROPOFF', 'BOTH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create ENUM trip status if not exists
DO $$ BEGIN
    CREATE TYPE public.trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Create ENUM manifest attendance status if not exists
DO $$ BEGIN
    CREATE TYPE public.manifest_attendance_status AS ENUM ('pending', 'boarded', 'dropped_off', 'absent', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5. Create stops table
CREATE TABLE IF NOT EXISTS public.stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    sequence_no INT NOT NULL,
    geofence_radius_meters NUMERIC DEFAULT 50 NOT NULL,
    stop_type public.stop_type DEFAULT 'BOTH' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_route_stop_sequence UNIQUE (route_id, sequence_no)
);

-- 6. Create schedules table
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    departure_time TIME NOT NULL,
    direction public.transit_direction NOT NULL,
    target_grades TEXT[] NOT NULL,
    days_of_week INT[] DEFAULT '{1,2,3,4,5}'::INT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Add stops and schedules links to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pickup_stop_id UUID REFERENCES public.stops(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dropoff_stop_id UUID REFERENCES public.stops(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS schedule_ids UUID[] DEFAULT '{}'::UUID[];

-- 8. Create daily trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    conductor_1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    trip_date DATE DEFAULT CURRENT_DATE NOT NULL,
    status public.trip_status DEFAULT 'scheduled' NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_schedule_trip_per_day UNIQUE (schedule_id, trip_date)
);

-- 9. Create daily manifest status tracking
CREATE TABLE IF NOT EXISTS public.trip_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    attendance public.manifest_attendance_status DEFAULT 'pending' NOT NULL,
    boarded_at TIMESTAMP WITH TIME ZONE,
    dropped_off_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_manifest_per_trip UNIQUE (trip_id, student_id)
);

-- 10. Spatial Indexing
CREATE INDEX IF NOT EXISTS idx_stops_location ON public.stops USING GIST (location);

-- 11. Enable RLS on new tables
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_manifests ENABLE ROW LEVEL SECURITY;

-- 12. Add default policy rules for RLS
DROP POLICY IF EXISTS "School Admins can manage Stops" ON public.stops;
CREATE POLICY "School Admins can manage Stops" ON public.stops
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Drivers and Conductors can view Stops" ON public.stops;
CREATE POLICY "Drivers and Conductors can view Stops" ON public.stops
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() IN ('driver', 'conductor'));

DROP POLICY IF EXISTS "School Admins can manage Schedules" ON public.schedules;
CREATE POLICY "School Admins can manage Schedules" ON public.schedules
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Drivers and Conductors can view Schedules" ON public.schedules;
CREATE POLICY "Drivers and Conductors can view Schedules" ON public.schedules
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() IN ('driver', 'conductor'));

DROP POLICY IF EXISTS "School Admins can manage Trips" ON public.trips;
CREATE POLICY "School Admins can manage Trips" ON public.trips
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Drivers can manage own daily Trips" ON public.trips;
CREATE POLICY "Drivers can manage own daily Trips" ON public.trips
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND (driver_id = auth.uid() OR public.jwt_role() = 'school_admin'));

DROP POLICY IF EXISTS "Drivers can update Trip Manifests" ON public.trip_manifests;
CREATE POLICY "Drivers can update Trip Manifests" ON public.trip_manifests
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND (public.jwt_role() IN ('driver', 'school_admin')));


-- --------------------------------------------------------
-- MIGRATION: 20260623000000_stops_distance_and_sequential_alerts.sql
-- --------------------------------------------------------

-- 1. Extend public.stops table with distance and duration attributes
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS distance_from_prev_meters NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS duration_from_prev_seconds NUMERIC DEFAULT 0 NOT NULL;

-- 2. Extend public.alerts_queue table with custom message attribute
ALTER TABLE public.alerts_queue ADD COLUMN IF NOT EXISTS custom_message TEXT;

-- 3. Create public.stop_arrivals_log table to prevent repeat triggers for the same stop on a daily run
CREATE TABLE IF NOT EXISTS public.stop_arrivals_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    stop_id UUID REFERENCES public.stops(id) ON DELETE CASCADE NOT NULL,
    trip_date DATE DEFAULT CURRENT_DATE NOT NULL,
    arrived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_stop_arrival_per_day UNIQUE (route_id, stop_id, trip_date)
);

-- Enable RLS on stop_arrivals_log
ALTER TABLE public.stop_arrivals_log ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for stop_arrivals_log
DROP POLICY IF EXISTS "School Admins can manage stop arrivals log" ON public.stop_arrivals_log;
CREATE POLICY "School Admins can manage stop arrivals log" ON public.stop_arrivals_log
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Drivers can view stop arrivals log" ON public.stop_arrivals_log;
CREATE POLICY "Drivers can view stop arrivals log" ON public.stop_arrivals_log
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');

-- 4. Re-declare check_geofence_triggers to run dynamic stops sequence checks & next-stop ETA calculations
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER AS $$
DECLARE
  stop_row RECORD;
  next_stop_row RECORD;
  student_row RECORD;
  stop_arrived_today BOOLEAN;
  alert_exists BOOLEAN;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  sms_body TEXT;
BEGIN
  -- Iterate through stops on this route ordered by sequence to determine exact order
  FOR stop_row IN
    SELECT id, name, location, sequence_no, geofence_radius_meters
    FROM public.stops
    WHERE route_id = new.route_id
    ORDER BY sequence_no ASC
  LOOP
    -- Check if coordinates fall within geofence radius (using geography type cast to measure in meters)
    IF ST_DWithin(stop_row.location::geography, new.coordinates::geography, stop_row.geofence_radius_meters) THEN
      
      -- Check if we already registered an arrival for this stop today
      SELECT EXISTS (
        SELECT 1 FROM public.stop_arrivals_log
        WHERE stop_id = stop_row.id
          AND trip_date = CURRENT_DATE
      ) INTO stop_arrived_today;

      -- If arrival is NOT logged today, record arrival and prepare alerts for the next stop
      IF NOT stop_arrived_today THEN
        INSERT INTO public.stop_arrivals_log (tenant_id, route_id, stop_id, trip_date)
        VALUES (new.tenant_id, new.route_id, stop_row.id, CURRENT_DATE)
        ON CONFLICT DO NOTHING;

        -- Query for the next stop in sequence
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = new.route_id
          AND sequence_no = stop_row.sequence_no + 1
        LIMIT 1
        INTO next_stop_row;

        -- If next stop exists, queue warning alerts for parents
        IF next_stop_row.id IS NOT NULL THEN
          
          -- Calculate dynamic ETA adding leg duration (adjusted for local East Africa Time timezone)
          eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
          eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
          eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
          
          IF eta_mins <= 0 THEN
            eta_mins := 5; -- default safety estimate
          END IF;

          -- Fetch students assigned to Stop N+1 (pickup or dropoff)
          FOR student_row IN
            SELECT s.id as student_id, s.name as student_name, s.parent_id
            FROM public.students s
            WHERE s.route_id = new.route_id
              AND (s.pickup_stop_id = next_stop_row.id OR s.dropoff_stop_id = next_stop_row.id)
          LOOP
            
            -- Enforce single alert dispatch per student per day
            SELECT EXISTS (
              SELECT 1 FROM public.sent_proximity_alerts
              WHERE student_id = student_row.student_id
                AND trip_date = CURRENT_DATE
            ) INTO alert_exists;

            IF NOT alert_exists THEN
              INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
              VALUES (new.tenant_id, student_row.student_id, CURRENT_DATE)
              ON CONFLICT (student_id, trip_date) DO NOTHING;

              sms_body := 'Safaricom Track: The school bus has departed ' || stop_row.name || 
                          ' and is headed to ' || next_stop_row.name || 
                          '. Estimated ETA is ' || eta_str || 
                          ' (approx. ' || eta_mins || ' mins away). Please prepare ' || 
                          student_row.student_name || ' for transit.';

              INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
              VALUES (new.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', sms_body);
            END IF;
            
          END LOOP;
        END IF;
      END IF;
      
    END IF;
  END LOOP;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260623010000_add_reorder_stops_rpc.sql
-- --------------------------------------------------------

-- Create reorder_stops database RPC utility to resequence stops safely without violating UNIQUE constraint
CREATE OR REPLACE FUNCTION public.reorder_stops(stop_ids UUID[])
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  -- 1. Temporarily move sequences to negative to avoid unique constraint collisions
  FOR i IN 1..array_length(stop_ids, 1) LOOP
    UPDATE public.stops
    SET sequence_no = -i
    WHERE id = stop_ids[i];
  END LOOP;

  -- 2. Restore sequences to their final positive values in the requested order
  FOR i IN 1..array_length(stop_ids, 1) LOOP
    UPDATE public.stops
    SET sequence_no = i
    WHERE id = stop_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260625000000_add_admin_role_to_profiles.sql
-- --------------------------------------------------------

-- Add admin_role column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_role TEXT;

-- Apply check constraint for admin_role values
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_admin_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_admin_role_check CHECK (admin_role IN ('Super Admin', 'Operations Admin', 'Bursar', 'Dispatcher', 'Fleet Manager', 'Roster Manager'));

-- Update existing school_admin users to default to 'Super Admin' if null
UPDATE public.profiles 
SET admin_role = 'Super Admin' 
WHERE role = 'school_admin' AND admin_role IS NULL;


-- --------------------------------------------------------
-- MIGRATION: 20260625010000_add_otp_to_profiles.sql
-- --------------------------------------------------------

-- Add otp_code and otp_expires_at columns to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;

-- Create an index on phone and otp_code for high-speed authentication searches
CREATE INDEX IF NOT EXISTS idx_profiles_phone_otp ON public.profiles(phone, otp_code);

-- Add is_emergency column to public.live_coordinates table
ALTER TABLE public.live_coordinates ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE;


-- --------------------------------------------------------
-- MIGRATION: 20260627000000_create_billing.sql
-- --------------------------------------------------------

-- Create billing_status table in public schema
CREATE TABLE IF NOT EXISTS public.billing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan_name TEXT DEFAULT 'Pro' NOT NULL,
    price_desc TEXT DEFAULT 'KES 10,000 / month + KES 1 / SMS' NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE NOT NULL,
    next_renewal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now() + interval '1 month') NOT NULL,
    students_count INT DEFAULT 214 NOT NULL,
    active_routes_count INT DEFAULT 5 NOT NULL,
    drivers_count INT DEFAULT 6 NOT NULL,
    sms_used_this_month INT DEFAULT 16000 NOT NULL,
    sms_limit_expected INT DEFAULT 25000 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.billing_status ENABLE ROW LEVEL SECURITY;

-- 1. School Admins can read billing details for their own school
DROP POLICY IF EXISTS "School Admins can read billing details" ON public.billing_status;
CREATE POLICY "School Admins can read billing details" ON public.billing_status
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 2. School Admins can update billing details (e.g. paying invoices) for their own school
DROP POLICY IF EXISTS "School Admins can update billing details" ON public.billing_status;
CREATE POLICY "School Admins can update billing details" ON public.billing_status
  FOR UPDATE USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 3. Super Admins can manage all billing details
DROP POLICY IF EXISTS "Super Admins can manage all billing" ON public.billing_status;
CREATE POLICY "Super Admins can manage all billing" ON public.billing_status
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- Auto-insert billing rows for any existing tenants in the sandbox
INSERT INTO public.billing_status (tenant_id, is_paid)
SELECT id, false FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;


-- --------------------------------------------------------
-- MIGRATION: 20260629000000_seed_default_tenant.sql
-- --------------------------------------------------------

-- Seed the default tenant if it does not exist
INSERT INTO public.tenants (id, name, domain)
VALUES ('8c9ad841-f762-4217-a021-9876251b5bcf', 'Safaricom Track School', 'safaricom-track.school')
ON CONFLICT (id) DO NOTHING;

-- Update handle_new_user trigger function to safely fall back to default metadata values
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, role, admin_role, name, email, phone, status)
  VALUES (
    new.id,
    COALESCE(
      nullif(new.raw_user_meta_data->>'tenant_id', '')::UUID,
      '8c9ad841-f762-4217-a021-9876251b5bcf'::UUID
    ),
    COALESCE(nullif(new.raw_user_meta_data->>'role', ''), 'school_admin'),
    COALESCE(nullif(new.raw_user_meta_data->>'admin_role', ''), 'Super Admin'),
    COALESCE(nullif(new.raw_user_meta_data->>'name', ''), 'Unknown User'),
    new.email,
    COALESCE(new.phone, new.raw_user_meta_data->>'phone'),
    'Available'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role,
    admin_role = COALESCE(profiles.admin_role, EXCLUDED.admin_role),
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = COALESCE(profiles.phone, EXCLUDED.phone);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260629100000_fix_jwt_claims.sql
-- --------------------------------------------------------

-- Fix public.jwt_role() to read the custom application role from the user_metadata claim in the request JWT
CREATE OR REPLACE FUNCTION public.jwt_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role', ''), 
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$ LANGUAGE sql STABLE;

-- Fix public.jwt_tenant_id() to read the tenant UUID from user_metadata or root claims in the request JWT
CREATE OR REPLACE FUNCTION public.jwt_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'tenant_id', ''), 
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', ''),
    NULL
  )::UUID;
$$ LANGUAGE sql STABLE;

-- Drop old check constraint and recreate it to permit the new 'Operations Admin' and 'Bursar' roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_admin_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_admin_role_check CHECK (
  admin_role IN ('Super Admin', 'Operations Admin', 'Bursar', 'Dispatcher', 'Fleet Manager', 'Roster Manager')
);


-- --------------------------------------------------------
-- MIGRATION: 20260629110000_create_system_config.sql
-- --------------------------------------------------------

-- Create tenant_configs table in public schema
CREATE TABLE IF NOT EXISTS public.tenant_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Tab 1: General School Profile
    school_name TEXT NOT NULL,
    school_phone TEXT,
    school_email TEXT,
    school_address TEXT,
    logo_url TEXT,
    
    -- Tab 2: Transport & Alert Settings
    geofence_radius_meters INT DEFAULT 500 NOT NULL,
    notify_on_trip_start BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_geofence_entry BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_boarded BOOLEAN DEFAULT TRUE NOT NULL,
    sms_template_geofence TEXT DEFAULT 'Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.' NOT NULL,
    sms_template_boarded TEXT DEFAULT 'Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.' NOT NULL,
    
    -- Tab 3: Operational Calendar & Working Hours
    operating_hours_start TIME DEFAULT '06:00:00' NOT NULL,
    operating_hours_end TIME DEFAULT '18:00:00' NOT NULL,
    operating_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']::TEXT[] NOT NULL,
    holidays JSONB DEFAULT '[]'::JSONB NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

-- 1. School Admins can manage config for their own school
DROP POLICY IF EXISTS "School Admins can manage own Tenant Config" ON public.tenant_configs;
CREATE POLICY "School Admins can manage own Tenant Config" ON public.tenant_configs
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 2. Super Admins can manage all config details
DROP POLICY IF EXISTS "Super Admins can manage all Tenant Configs" ON public.tenant_configs;
CREATE POLICY "Super Admins can manage all Tenant Configs" ON public.tenant_configs
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- Auto-insert config rows for any existing tenants in the sandbox
INSERT INTO public.tenant_configs (tenant_id, school_name, school_phone, school_email, school_address)
SELECT 
  id, 
  name, 
  '+254 700 000 000', 
  'admin@' || domain, 
  'Nairobi, Kenya'
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;


-- --------------------------------------------------------
-- MIGRATION: 20260701000000_driver_login_rls.sql
-- --------------------------------------------------------

-- Drop the foreign key constraint on profiles.id to allow inserting staff profiles without auth.users records
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Drop old policies to keep profiles fully secure and RLS protected
DROP POLICY IF EXISTS "Allow anonymous SELECT of profiles for login verification" ON public.profiles;
DROP POLICY IF EXISTS "Allow anonymous UPDATE of profiles for login verification" ON public.profiles;

-- Create stored procedure to handle driver and conductor login securely (RLS Bypass)
CREATE OR REPLACE FUNCTION public.verify_driver_login(phone_num TEXT, otp_val TEXT)
RETURNS JSONB AS $$
DECLARE
  profile_row RECORD;
  vehicle_row RECORD;
  route_id_val UUID;
  result JSONB;
  clean_phone TEXT;
BEGIN
  -- Normalize phone number
  clean_phone := trim(phone_num);
  IF clean_phone LIKE '0%' THEN
    clean_phone := '+254' || substr(clean_phone, 2);
  ELSIF clean_phone NOT LIKE '+%' THEN
    clean_phone := '+' || clean_phone;
  END IF;

  -- Find the profile matching phone and role
  SELECT * INTO profile_row
  FROM public.profiles
  WHERE (phone = phone_num OR phone = clean_phone)
    AND role IN ('driver', 'conductor')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found with this phone number');
  END IF;

  -- Check status
  IF profile_row.status = 'Unavailable' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login denied. Driver/Conductor status is set to Unavailable.');
  END IF;

  -- Verify OTP
  IF profile_row.otp_code IS DISTINCT FROM otp_val THEN
    -- Sandbox bypass codes
    IF otp_val != '123456' AND otp_val != '589204' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP verification code');
    END IF;
  END IF;

  -- Validate expiration if not using bypass codes
  IF otp_val != '123456' AND profile_row.otp_expires_at IS NOT NULL AND profile_row.otp_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP verification code has expired');
  END IF;

  -- Clear OTP code to prevent reuse
  UPDATE public.profiles
  SET otp_code = NULL, otp_expires_at = NULL
  WHERE id = profile_row.id;

  -- Fetch active vehicle
  IF profile_row.role = 'driver' THEN
    SELECT id, model, license_plate INTO vehicle_row
    FROM public.vehicles
    WHERE active_driver_id = profile_row.id
    LIMIT 1;
  ELSE
    SELECT id, model, license_plate INTO vehicle_row
    FROM public.vehicles
    WHERE conductor_1_id = profile_row.id OR conductor_2_id = profile_row.id
    LIMIT 1;
  END IF;

  -- Fetch active route associated with the vehicle via schedules, with fallback to first route
  IF vehicle_row.id IS NOT NULL THEN
    SELECT route_id INTO route_id_val
    FROM public.schedules
    WHERE vehicle_id = vehicle_row.id
    LIMIT 1;
  END IF;

  IF route_id_val IS NULL THEN
    SELECT id INTO route_id_val
    FROM public.routes
    LIMIT 1;
  END IF;

  -- Build success response session payload
  result := jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', profile_row.id,
      'name', profile_row.name,
      'email', profile_row.email,
      'phone', profile_row.phone,
      'role', profile_row.role,
      'tenant_id', profile_row.tenant_id,
      'vehicle_id', COALESCE(vehicle_row.id, 'e5015e10-c09a-4c22-901d-5573752e379c'::UUID),
      'route_id', COALESCE(route_id_val, '782cd841-f762-4217-a021-9876251b5bca'::UUID)
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260701010000_add_vehicle_to_route.sql
-- --------------------------------------------------------

-- Add vehicle_id to public.routes to map a bus directly to a route
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- Enable RLS and add policies if needed, although routes is already under RLS.
-- Since routes is already under RLS, any select policy that school_admin can manage is already active.


-- --------------------------------------------------------
-- MIGRATION: 20260701020000_add_vehicle_to_schedule.sql
-- --------------------------------------------------------

-- 1. Drop vehicle_id from public.routes since one route can have multiple buses (schedules)
ALTER TABLE public.routes DROP COLUMN IF EXISTS vehicle_id;

-- 2. Add vehicle_id to public.schedules to map a bus (vehicle) to a specific run schedule
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;


-- --------------------------------------------------------
-- MIGRATION: 20260706000000_driver_app_anonymous_policies.sql
-- --------------------------------------------------------

-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public read of routes" ON public.routes;
DROP POLICY IF EXISTS "Allow public read of schedules" ON public.schedules;
DROP POLICY IF EXISTS "Allow public read of stops" ON public.stops;
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
DROP POLICY IF EXISTS "Allow public update of students" ON public.students;
DROP POLICY IF EXISTS "Allow public insert of live_coordinates" ON public.live_coordinates;

-- Create additional SELECT policies to allow anonymous reads on transit metadata tables
DROP POLICY IF EXISTS "Allow public read of routes" ON public.routes;
CREATE POLICY "Allow public read of routes" ON public.routes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public read of schedules" ON public.schedules;
CREATE POLICY "Allow public read of schedules" ON public.schedules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public read of stops" ON public.stops;
CREATE POLICY "Allow public read of stops" ON public.stops FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
CREATE POLICY "Allow public read of students" ON public.students FOR SELECT USING (true);

-- Create additional UPDATE policy to allow the driver app (operating anonymously) to update student status
DROP POLICY IF EXISTS "Allow public update of students" ON public.students;
CREATE POLICY "Allow public update of students" ON public.students FOR UPDATE USING (true) WITH CHECK (true);

-- Create additional INSERT policy to allow the driver app (operating anonymously) to stream telemetry
DROP POLICY IF EXISTS "Allow public insert of live_coordinates" ON public.live_coordinates;
CREATE POLICY "Allow public insert of live_coordinates" ON public.live_coordinates FOR INSERT WITH CHECK (true);


-- --------------------------------------------------------
-- MIGRATION: 20260706100000_allow_anonymous_student_management.sql
-- --------------------------------------------------------

-- Migration to allow anonymous/public student insert and delete operations
-- This enables the development admin console to perform student management without auth session tokens

-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public insert of students" ON public.students;
DROP POLICY IF EXISTS "Allow public delete of students" ON public.students;

-- Create policies to allow public INSERT and DELETE
DROP POLICY IF EXISTS "Allow public insert of students" ON public.students;
CREATE POLICY "Allow public insert of students" ON public.students FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete of students" ON public.students;
CREATE POLICY "Allow public delete of students" ON public.students FOR DELETE USING (true);


-- --------------------------------------------------------
-- MIGRATION: 20260711130000_allow_anonymous_vehicle_allocation.sql
-- --------------------------------------------------------

-- Migration to allow anonymous/public vehicle select, insert, update, and delete
-- This enables the development admin console to perform vehicle and driver allocation without auth session tokens

-- Drop policies if they already exist to ensure clean deployment
DROP POLICY IF EXISTS "Allow public read of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public insert of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public update of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public delete of vehicles" ON public.vehicles;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE
DROP POLICY IF EXISTS "Allow public read of vehicles" ON public.vehicles;
CREATE POLICY "Allow public read of vehicles" ON public.vehicles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert of vehicles" ON public.vehicles;
CREATE POLICY "Allow public insert of vehicles" ON public.vehicles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update of vehicles" ON public.vehicles;
CREATE POLICY "Allow public update of vehicles" ON public.vehicles FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete of vehicles" ON public.vehicles;
CREATE POLICY "Allow public delete of vehicles" ON public.vehicles FOR DELETE USING (true);

-- Drop policies for trips if they exist
DROP POLICY IF EXISTS "Allow public read of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public delete of trips" ON public.trips;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE on trips
DROP POLICY IF EXISTS "Allow public read of trips" ON public.trips;
CREATE POLICY "Allow public read of trips" ON public.trips FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert of trips" ON public.trips;
CREATE POLICY "Allow public insert of trips" ON public.trips FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update of trips" ON public.trips;
CREATE POLICY "Allow public update of trips" ON public.trips FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete of trips" ON public.trips;
CREATE POLICY "Allow public delete of trips" ON public.trips FOR DELETE USING (true);

-- Drop policies for trip manifests if they exist
DROP POLICY IF EXISTS "Allow public read of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public insert of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public update of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public delete of trip_manifests" ON public.trip_manifests;

-- Create policies to allow public SELECT, INSERT, UPDATE, and DELETE on trip_manifests
DROP POLICY IF EXISTS "Allow public read of trip_manifests" ON public.trip_manifests;
CREATE POLICY "Allow public read of trip_manifests" ON public.trip_manifests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert of trip_manifests" ON public.trip_manifests;
CREATE POLICY "Allow public insert of trip_manifests" ON public.trip_manifests FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update of trip_manifests" ON public.trip_manifests;
CREATE POLICY "Allow public update of trip_manifests" ON public.trip_manifests FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete of trip_manifests" ON public.trip_manifests;
CREATE POLICY "Allow public delete of trip_manifests" ON public.trip_manifests FOR DELETE USING (true);


-- --------------------------------------------------------
-- MIGRATION: 20260711150000_add_trip_overrides.sql
-- --------------------------------------------------------

-- Migration to add custom override fields to trips table
-- Enables delayed departure times, custom status labels, and descriptions for daily runs

ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS custom_departure_time TEXT,
ADD COLUMN IF NOT EXISTS status_override TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;


-- --------------------------------------------------------
-- MIGRATION: 20260713090000_add_notifications_config.sql
-- --------------------------------------------------------

-- Add SMS toggle to configuration
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT FALSE NOT NULL;

-- Allow alerts_queue to support driver/conductor SMS logs (by making student_id nullable)
ALTER TABLE public.alerts_queue ALTER COLUMN student_id DROP NOT NULL;

-- Create notifications table for in-app alerts
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'trip_status', 'trip_start', 'eta', 'student_event'
    read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create user_fcm_tokens table for device push tokens
CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL,
    device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_device_token UNIQUE (user_id, token)
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "School Admins can view tenant notifications" ON public.notifications;
CREATE POLICY "School Admins can view tenant notifications" ON public.notifications
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- Create policies for user_fcm_tokens
DROP POLICY IF EXISTS "Users can manage own FCM tokens" ON public.user_fcm_tokens;
CREATE POLICY "Users can manage own FCM tokens" ON public.user_fcm_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- DB Trigger: Notify on Trip Status Update (and Trip Start)
CREATE OR REPLACE FUNCTION public.on_trip_status_update()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  sms_enabled BOOLEAN;
  custom_msg TEXT;
  status_label TEXT;
  route_name TEXT;
  next_stop_row RECORD;
  direction_val public.transit_direction;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  eta_msg TEXT;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.status_override IS DISTINCT FROM NEW.status_override) THEN
    -- Check configuration
    SELECT sms_notifications_enabled INTO sms_enabled
    FROM public.tenant_configs
    WHERE tenant_id = NEW.tenant_id;
    
    IF sms_enabled IS NULL THEN
      sms_enabled := FALSE;
    END IF;

    -- Get route name
    SELECT name INTO route_name FROM public.routes WHERE id = NEW.route_id;
    status_label := COALESCE(NEW.status_override, NEW.status::text);
    
    -- Format message
    IF status_label ILIKE '%delay%' AND NEW.custom_departure_time IS NOT NULL THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' is delayed. New departure time: ' || NEW.custom_departure_time || '.';
    ELSIF status_label = 'cancelled' THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' has been cancelled.';
    ELSIF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' has started. Bus is active on route.';
    ELSE
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' status is now ' || status_label || '.';
    END IF;

    IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
      custom_msg := custom_msg || ' Note: ' || NEW.description;
    END IF;

    -- 1. Notify parents of all students on this route
    FOR student_row IN 
      SELECT s.id as student_id, s.parent_id
      FROM public.students s
      WHERE s.route_id = NEW.route_id AND s.parent_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, student_row.parent_id, 'Trip Update', custom_msg, 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', custom_msg);
      END IF;
    END LOOP;

    -- 2. Notify Driver and Conductor (In-App + SMS if enabled)
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.driver_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.driver_id, 'trip_status', 'Safaricom Track: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;
    
    IF NEW.conductor_1_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.conductor_1_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.conductor_1_id, 'trip_status', 'Safaricom Track: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;

    -- 3. Notify first stop ETA when trip starts
    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      SELECT direction INTO direction_val FROM public.schedules WHERE id = NEW.schedule_id;
      
      IF direction_val = 'HOME_TO_SCHOOL' THEN
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      ELSE -- SCHOOL_TO_HOME
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id AND sequence_no > 1 ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      END IF;

      IF next_stop_row.id IS NOT NULL THEN
        eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
        eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
        eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
        IF eta_mins <= 0 THEN eta_mins := 5; END IF;

        FOR student_row IN
          SELECT s.id as student_id, s.parent_id, s.name as student_name
          FROM public.students s
          WHERE s.route_id = NEW.route_id AND s.parent_id IS NOT NULL
            AND (
              (direction_val = 'HOME_TO_SCHOOL' AND s.pickup_stop_id = next_stop_row.id) OR
              (direction_val = 'SCHOOL_TO_HOME' AND s.dropoff_stop_id = next_stop_row.id)
            )
        LOOP
          eta_msg := 'Safaricom Track: Bus has started the trip and is heading to ' || next_stop_row.name || 
                     '. Estimated ETA is ' || eta_str || ' (approx. ' || eta_mins || ' mins away).';
          
          INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
          VALUES (NEW.tenant_id, student_row.parent_id, 'Bus Approaching Stop', eta_msg, 'eta');

          IF sms_enabled THEN
            INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
            VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', eta_msg);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_trip_status_updated
  AFTER UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.on_trip_status_update();

-- DB Trigger: Notify on Student Attendance Manifest Updates (Boarded / Dropped off)
CREATE OR REPLACE FUNCTION public.on_manifest_attendance_update()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  sms_enabled BOOLEAN;
  msg TEXT;
  now_time TEXT;
  vehicle_plate TEXT;
BEGIN
  IF (OLD.attendance IS DISTINCT FROM NEW.attendance) AND (NEW.attendance IN ('boarded', 'dropped_off')) THEN
    SELECT sms_notifications_enabled INTO sms_enabled FROM public.tenant_configs WHERE tenant_id = NEW.tenant_id;
    IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
    
    SELECT s.name as student_name, s.parent_id, v.license_plate
    FROM public.students s
    JOIN public.trips t ON t.id = NEW.trip_id
    LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
    WHERE s.id = NEW.student_id
    INTO student_row;
    
    IF student_row.parent_id IS NOT NULL THEN
      now_time := to_char(timezone('Africa/Nairobi', now()), 'HH:MI AM');
      vehicle_plate := COALESCE(student_row.license_plate, 'assigned bus');
      
      IF NEW.attendance = 'boarded' THEN
        msg := 'Bus Schedule: ' || student_row.student_name || ' has safely boarded the school bus ' || vehicle_plate || ' at ' || now_time || '.';
      ELSE
        msg := 'Bus Schedule: ' || student_row.student_name || ' has been dropped off safely at ' || now_time || '.';
      END IF;

      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, student_row.parent_id, 'Student Status Alert', msg, 'student_event');

      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.student_id, student_row.parent_id, NEW.attendance::text, msg);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_manifest_attendance_updated
  AFTER UPDATE ON public.trip_manifests
  FOR EACH ROW EXECUTE FUNCTION public.on_manifest_attendance_update();

-- Re-declare check_geofence_triggers to support SMS config & route direction checks & app notifications
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER AS $$
DECLARE
  stop_row RECORD;
  next_stop_row RECORD;
  student_row RECORD;
  stop_arrived_today BOOLEAN;
  alert_exists BOOLEAN;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  sms_body TEXT;
  sms_enabled BOOLEAN;
  active_schedule_id UUID;
  direction_val public.transit_direction;
BEGIN
  -- Get SMS configuration
  SELECT sms_notifications_enabled INTO sms_enabled
  FROM public.tenant_configs
  WHERE tenant_id = NEW.tenant_id;
  
  IF sms_enabled IS NULL THEN
    sms_enabled := FALSE;
  END IF;
  
  -- Try to find active schedule and direction for the vehicle
  SELECT schedule_id INTO active_schedule_id
  FROM public.trips
  WHERE vehicle_id = NEW.vehicle_id
    AND trip_date = CURRENT_DATE
    AND status = 'in_progress'
  LIMIT 1;
  
  IF active_schedule_id IS NOT NULL THEN
    SELECT direction INTO direction_val
    FROM public.schedules
    WHERE id = active_schedule_id;
  END IF;
  
  -- Default direction if none active
  IF direction_val IS NULL THEN
    direction_val := 'HOME_TO_SCHOOL';
  END IF;

  -- Iterate through stops on this route ordered by sequence to determine exact order
  FOR stop_row IN
    SELECT id, name, location, sequence_no, geofence_radius_meters
    FROM public.stops
    WHERE route_id = NEW.route_id
    ORDER BY sequence_no ASC
  LOOP
    -- Check if coordinates fall within geofence radius
    IF ST_DWithin(stop_row.location::geography, NEW.coordinates::geography, stop_row.geofence_radius_meters) THEN
      
      -- Check if we already registered an arrival for this stop today
      SELECT EXISTS (
        SELECT 1 FROM public.stop_arrivals_log
        WHERE stop_id = stop_row.id
          AND trip_date = CURRENT_DATE
      ) INTO stop_arrived_today;

      -- If arrival is NOT logged today, record arrival and prepare alerts for the next stop
      IF NOT stop_arrived_today THEN
        INSERT INTO public.stop_arrivals_log (tenant_id, route_id, stop_id, trip_date)
        VALUES (NEW.tenant_id, NEW.route_id, stop_row.id, CURRENT_DATE)
        ON CONFLICT DO NOTHING;

        -- Query for the next stop in sequence
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = NEW.route_id
          AND sequence_no = stop_row.sequence_no + 1
        LIMIT 1
        INTO next_stop_row;

        -- If next stop exists, queue warning alerts for parents
        IF next_stop_row.id IS NOT NULL THEN
          
          -- Calculate dynamic ETA adding leg duration (adjusted for local East Africa Time timezone)
          eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
          eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
          eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
          
          IF eta_mins <= 0 THEN
            eta_mins := 5; -- default safety estimate
          END IF;

          -- Fetch students assigned to Stop N+1 (pickup or dropoff depending on route direction)
          FOR student_row IN
            SELECT s.id as student_id, s.name as student_name, s.parent_id
            FROM public.students s
            WHERE s.route_id = NEW.route_id
              AND (
                (direction_val = 'HOME_TO_SCHOOL' AND s.pickup_stop_id = next_stop_row.id) OR
                (direction_val = 'SCHOOL_TO_HOME' AND s.dropoff_stop_id = next_stop_row.id)
              )
          LOOP
            
            -- Enforce single alert dispatch per student per day
            SELECT EXISTS (
              SELECT 1 FROM public.sent_proximity_alerts
              WHERE student_id = student_row.student_id
                AND trip_date = CURRENT_DATE
            ) INTO alert_exists;

            IF NOT alert_exists THEN
              INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
              VALUES (NEW.tenant_id, student_row.student_id, CURRENT_DATE)
              ON CONFLICT (student_id, trip_date) DO NOTHING;

              sms_body := 'Bus Schedule: The school bus has departed ' || stop_row.name || 
                          ' and is headed to ' || next_stop_row.name || 
                          '. Estimated ETA is ' || eta_str || 
                          ' (approx. ' || eta_mins || ' mins away).';

              -- 1. Insert App Notification (always)
              INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
              VALUES (NEW.tenant_id, student_row.parent_id, 'Bus Approaching Stop', sms_body, 'eta');

              -- 2. Insert SMS (if enabled)
              IF sms_enabled THEN
                INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
                VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', sms_body);
              END IF;
            END IF;
            
          END LOOP;
        END IF;
      END IF;
      
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DB Trigger: Send Webhook to Firebase Push Notification Edge Function on Insert
CREATE OR REPLACE FUNCTION public.trigger_push_webhook()
RETURNS TRIGGER AS $$
DECLARE
  request_host TEXT;
  webhook_url TEXT;
BEGIN
  BEGIN
    request_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION
    WHEN OTHERS THEN
      request_host := NULL;
  END;

  IF request_host IS NULL OR request_host = '' THEN
    request_host := 'nxhccqbvjrxqqfvpfcmx.supabase.co';
  END IF;

  IF request_host LIKE 'localhost%' OR request_host LIKE '127.0.0.1%' OR request_host LIKE '54321%' THEN
    webhook_url := 'http://kong:8000/functions/v1/send-push';
  ELSE
    IF request_host NOT LIKE 'http%' THEN
      webhook_url := 'https://' || request_host || '/functions/v1/send-push';
    ELSE
      webhook_url := request_host || '/functions/v1/send-push';
    END IF;
  END IF;

  BEGIN
    PERFORM extensions.net_http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('private.keys.service_role', true), '')
      ),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_ms := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger notifications push webhook: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_notification_queued
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_webhook();


-- --------------------------------------------------------
-- MIGRATION: 20260713100000_add_sms_templates.sql
-- --------------------------------------------------------

-- Add new SMS templates to tenant_configs with support for parent_name, student_name, route_name, vehicle_plate, trip_name, trip_description, and status_override
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_template_trip_start TEXT DEFAULT 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.' NOT NULL;
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_template_trip_status TEXT DEFAULT 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.' NOT NULL;

-- Re-declare trigger function on public.trips to support customizable templates and parent/student/vehicle/override tokens
CREATE OR REPLACE FUNCTION public.on_trip_status_update()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  sms_enabled BOOLEAN;
  template_start TEXT;
  template_status TEXT;
  base_msg TEXT;
  custom_msg TEXT;
  status_label TEXT;
  route_name TEXT;
  trip_name TEXT;
  vehicle_plate TEXT;
  next_stop_row RECORD;
  direction_val public.transit_direction;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  eta_msg TEXT;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.status_override IS DISTINCT FROM NEW.status_override) THEN
    -- Check configuration and templates
    SELECT 
      sms_notifications_enabled,
      sms_template_trip_start,
      sms_template_trip_status
    INTO 
      sms_enabled,
      template_start,
      template_status
    FROM public.tenant_configs
    WHERE tenant_id = NEW.tenant_id;
    
    IF sms_enabled IS NULL THEN
      sms_enabled := FALSE;
    END IF;

    IF template_start IS NULL THEN
      template_start := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.';
    END IF;

    IF template_status IS NULL THEN
      template_status := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.';
    END IF;

    -- Get route and trip name (schedule name)
    SELECT name INTO route_name FROM public.routes WHERE id = NEW.route_id;
    SELECT name INTO trip_name FROM public.schedules WHERE id = NEW.schedule_id;
    status_label := COALESCE(NEW.status_override, NEW.status::text);
    
    -- Get vehicle plate
    IF NEW.vehicle_id IS NOT NULL THEN
      SELECT plate_no INTO vehicle_plate FROM public.vehicles WHERE id = NEW.vehicle_id;
    END IF;
    IF vehicle_plate IS NULL THEN
      vehicle_plate := 'assigned bus';
    END IF;
    
    -- Format base message using route/status templates
    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      base_msg := replace(template_start, '{route_name}', route_name);
    ELSE
      base_msg := replace(template_status, '{route_name}', route_name);
      base_msg := replace(base_msg, '{status_label}', status_label);
      IF NEW.custom_departure_time IS NOT NULL THEN
        base_msg := replace(base_msg, '{departure_time}', NEW.custom_departure_time);
      ELSE
        -- Clean up departure time token if not provided
        base_msg := replace(base_msg, ' New departure time: {departure_time}.', '');
        base_msg := replace(base_msg, ' New departure: {departure_time}.', '');
        base_msg := replace(base_msg, ' ({departure_time})', '');
        base_msg := replace(base_msg, ' {departure_time}', '');
      END IF;
    END IF;

    -- Replace global trip tokens at base message level
    base_msg := replace(base_msg, '{trip_name}', COALESCE(trip_name, route_name));
    base_msg := replace(base_msg, '{trip_description}', COALESCE(NEW.description, 'no specified reason'));
    base_msg := replace(base_msg, '{status_override}', COALESCE(NEW.status_override, NEW.status::text));

    -- Only append description dynamically if it wasn't already placeholder-replaced in the template
    IF NEW.description IS NOT NULL AND NEW.description <> '' 
       AND position('{trip_description}' in template_status) = 0 
       AND position('{trip_description}' in template_start) = 0 THEN
      base_msg := base_msg || ' Note: ' || NEW.description;
    END IF;

    -- 1. Notify parents of all students on this route
    FOR student_row IN 
      SELECT 
        s.id as student_id, 
        s.name as student_name, 
        s.parent_id,
        p.name as parent_name
      FROM public.students s
      JOIN public.profiles p ON s.parent_id = p.id
      WHERE s.route_id = NEW.route_id
    LOOP
      -- Perform parent-student specific replacements on a copy
      custom_msg := replace(base_msg, '{parent_name}', COALESCE(student_row.parent_name, 'Parent'));
      custom_msg := replace(custom_msg, '{student_name}', COALESCE(student_row.student_name, 'your child'));
      custom_msg := replace(custom_msg, '{vehicle_plate}', vehicle_plate);

      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, student_row.parent_id, 'Trip Update', custom_msg, 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', custom_msg);
      END IF;
    END LOOP;

    -- 2. Notify Driver and Conductor (In-App + SMS if enabled)
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.driver_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.driver_id, 'trip_status', 'Bus Schedule: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;
    
    IF NEW.conductor_1_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.conductor_1_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.conductor_1_id, 'trip_status', 'Bus Schedule: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;

    -- 3. Notify first stop ETA when trip starts
    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      SELECT direction INTO direction_val FROM public.schedules WHERE id = NEW.schedule_id;
      
      IF direction_val = 'HOME_TO_SCHOOL' THEN
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      ELSE -- SCHOOL_TO_HOME
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id AND sequence_no > 1 ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      END IF;

      IF next_stop_row.id IS NOT NULL THEN
        eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
        eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
        eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
        IF eta_mins <= 0 THEN eta_mins := 5; END IF;

        FOR student_row IN
          SELECT 
            s.id as student_id, 
            s.name as student_name, 
            s.parent_id,
            p.name as parent_name
          FROM public.students s
          JOIN public.profiles p ON s.parent_id = p.id
          WHERE s.route_id = NEW.route_id
            AND (
              (direction_val = 'HOME_TO_SCHOOL' AND s.pickup_stop_id = next_stop_row.id) OR
              (direction_val = 'SCHOOL_TO_HOME' AND s.dropoff_stop_id = next_stop_row.id)
            )
        LOOP
          eta_msg := 'Hi ' || COALESCE(student_row.parent_name, 'Parent') || ', Bus Schedule: Bus ' || vehicle_plate || 
                     ' has started the trip and is heading to ' || next_stop_row.name || 
                     ' for ' || COALESCE(student_row.student_name, 'your child') || 
                     '. Estimated ETA is ' || eta_str || ' (approx. ' || eta_mins || ' mins away).';
          
          INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
          VALUES (NEW.tenant_id, student_row.parent_id, 'Bus Approaching Stop', eta_msg, 'eta');

          IF sms_enabled THEN
            INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
            VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', eta_msg);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260714120000_add_eta_calculation_queue.sql
-- --------------------------------------------------------

-- Add Mapbox token configuration to tenant_configs
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS mapbox_access_token TEXT;

-- Create ETA calculation queue table
CREATE TABLE IF NOT EXISTS public.eta_calculation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    bus_lng DOUBLE PRECISION NOT NULL,
    bus_lat DOUBLE PRECISION NOT NULL,
    stop_lng DOUBLE PRECISION NOT NULL,
    stop_lat DOUBLE PRECISION NOT NULL,
    stop_name TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    student_name TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on eta_calculation_queue
ALTER TABLE public.eta_calculation_queue ENABLE ROW LEVEL SECURITY;

-- Create policy for system/service_role to manage the queue
DROP POLICY IF EXISTS "Admins and service role can manage eta queue" ON public.eta_calculation_queue;
CREATE POLICY "Admins and service role can manage eta queue" ON public.eta_calculation_queue
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Trigger Function: Call Deno Edge Function calculate-eta when queue row is inserted
CREATE OR REPLACE FUNCTION public.trigger_eta_webhook()
RETURNS TRIGGER AS $$
DECLARE
  request_host TEXT;
  webhook_url TEXT;
  auth_header TEXT;
BEGIN
  BEGIN
    request_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION WHEN OTHERS THEN
    request_host := 'localhost:54321';
  END;

  IF request_host IS NULL OR request_host = '' THEN
    request_host := 'localhost:54321';
  END IF;

  IF request_host LIKE 'localhost%' OR request_host LIKE '127.0.0.1%' OR request_host = 'kong:8000' THEN
    webhook_url := 'http://kong:8000/functions/v1/calculate-eta';
  ELSE
    webhook_url := 'https://' || request_host || '/functions/v1/calculate-eta';
  END IF;

  BEGIN
    auth_header := current_setting('request.headers', true)::jsonb->>'authorization';
  EXCEPTION WHEN OTHERS THEN
    auth_header := NULL;
  END;

  PERFORM net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', COALESCE(auth_header, '')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_eta_queued
AFTER INSERT ON public.eta_calculation_queue
FOR EACH ROW EXECUTE FUNCTION public.trigger_eta_webhook();


-- Re-declare check_geofence_triggers to insert to eta_calculation_queue if mapbox_access_token is available
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER AS $$
DECLARE
  stop_row RECORD;
  next_stop_row RECORD;
  stop_arrived_today BOOLEAN;
  direction_val public.transit_direction;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  sms_body TEXT;
  sms_enabled BOOLEAN;
  mapbox_token TEXT;
  alert_exists BOOLEAN;
  student_row RECORD;
  bus_lng DOUBLE PRECISION;
  bus_lat DOUBLE PRECISION;
  stop_lng DOUBLE PRECISION;
  stop_lat DOUBLE PRECISION;
BEGIN
  -- Resolve direction
  SELECT direction INTO direction_val
  FROM public.schedules
  WHERE id = (SELECT schedule_id FROM public.trips WHERE id = NEW.trip_id);

  -- Load configuration, SMS enable, and Mapbox access token
  SELECT 
    sms_notifications_enabled,
    mapbox_access_token
  INTO 
    sms_enabled,
    mapbox_token
  FROM public.tenant_configs
  WHERE tenant_id = NEW.tenant_id;

  IF sms_enabled IS NULL THEN
    sms_enabled := FALSE;
  END IF;

  -- 1. Loop through all stops for the route
  FOR stop_row IN
    SELECT id, name, location, sequence_no, geofence_radius_meters
    FROM public.stops
    WHERE route_id = NEW.route_id
    ORDER BY sequence_no ASC
  LOOP
    -- Check if coordinates fall within geofence radius
    IF ST_DWithin(stop_row.location::geography, NEW.geom::geography, stop_row.geofence_radius_meters) THEN
      
      -- Check if we already registered an arrival for this stop today
      SELECT EXISTS (
        SELECT 1 FROM public.stop_arrivals_log
        WHERE stop_id = stop_row.id
          AND trip_date = CURRENT_DATE
      ) INTO stop_arrived_today;

      -- If arrival is NOT logged today, record arrival and prepare alerts for the next stop
      IF NOT stop_arrived_today THEN
        INSERT INTO public.stop_arrivals_log (tenant_id, route_id, stop_id, trip_date)
        VALUES (NEW.tenant_id, NEW.route_id, stop_row.id, CURRENT_DATE)
        ON CONFLICT DO NOTHING;

        -- Query for the next stop in sequence
        SELECT id, name, location, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = NEW.route_id
          AND sequence_no = stop_row.sequence_no + 1
        LIMIT 1
        INTO next_stop_row;

        -- If next stop exists, queue warning alerts for parents
        IF next_stop_row.id IS NOT NULL THEN
          
          -- Extract coordinates for calculations
          bus_lng := ST_X(NEW.geom::geometry);
          bus_lat := ST_Y(NEW.geom::geometry);
          stop_lng := ST_X(next_stop_row.location::geometry);
          stop_lat := ST_Y(next_stop_row.location::geometry);

          -- Fetch students assigned to Stop N+1 (pickup or dropoff depending on route direction)
          FOR student_row IN
            SELECT 
              s.id as student_id, 
              s.name as student_name, 
              s.parent_id,
              p.name as parent_name,
              v.plate_no as vehicle_plate
            FROM public.students s
            JOIN public.profiles p ON s.parent_id = p.id
            JOIN public.trips t ON t.id = NEW.trip_id
            LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
            WHERE s.route_id = NEW.route_id
              AND (
                (direction_val = 'HOME_TO_SCHOOL' AND s.pickup_stop_id = next_stop_row.id) OR
                (direction_val = 'SCHOOL_TO_HOME' AND s.dropoff_stop_id = next_stop_row.id)
              )
          LOOP
            
            -- Enforce single alert dispatch per student per day
            SELECT EXISTS (
              SELECT 1 FROM public.sent_proximity_alerts
              WHERE student_id = student_row.student_id
                AND trip_date = CURRENT_DATE
            ) INTO alert_exists;

            IF NOT alert_exists THEN
              -- Mark as sent to prevent multiple alerts
              INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
              VALUES (NEW.tenant_id, student_row.student_id, CURRENT_DATE)
              ON CONFLICT (student_id, trip_date) DO NOTHING;

              IF mapbox_token IS NOT NULL AND mapbox_token <> '' THEN
                -- Async Mode: Queue the row for Mapbox Matrix lookup
                INSERT INTO public.eta_calculation_queue (
                  tenant_id,
                  student_id,
                  parent_id,
                  bus_lng,
                  bus_lat,
                  stop_lng,
                  stop_lat,
                  stop_name,
                  vehicle_plate,
                  student_name,
                  parent_name
                )
                VALUES (
                  NEW.tenant_id,
                  student_row.student_id,
                  student_row.parent_id,
                  bus_lng,
                  bus_lat,
                  stop_lng,
                  stop_lat,
                  next_stop_row.name,
                  COALESCE(student_row.vehicle_plate, 'assigned bus'),
                  student_row.student_name,
                  student_row.parent_name
                );
              ELSE
                -- Sync Mode (Fallback): Calculate dynamic ETA adding static leg duration
                eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
                eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
                eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
                
                IF eta_mins <= 0 THEN
                  eta_mins := 5; -- default safety estimate
                END IF;

                sms_body := 'Bus Schedule: The school bus has departed ' || stop_row.name || 
                            ' and is headed to ' || next_stop_row.name || 
                            '. Estimated ETA is ' || eta_str || 
                            ' (approx. ' || eta_mins || ' mins away).';

                -- 1. Insert App Notification (always)
                INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
                VALUES (NEW.tenant_id, student_row.parent_id, 'Bus Approaching Stop', sms_body, 'eta');

                -- 2. Insert SMS (if enabled)
                IF sms_enabled THEN
                  INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
                  VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', sms_body);
                END IF;
              END IF;
            END IF;
            
          END LOOP;
        END IF;
      END IF;
      
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260715100000_parent_app_geofence_sync.sql
-- --------------------------------------------------------

-- Migration to automatically sync geofence boundary polygon whenever a student's pickup_location is updated

-- 1. Create or replace trigger function to sync student geofence
CREATE OR REPLACE FUNCTION public.sync_student_geofence()
RETURNS TRIGGER AS $$
DECLARE
  default_radius NUMERIC := 500; -- Default 500 meters
BEGIN
  -- If pickup_location has changed (or on insert) and is not null, calculate geofence
  IF (TG_OP = 'INSERT' OR NEW.pickup_location IS DISTINCT FROM OLD.pickup_location) THEN
    IF NEW.pickup_location IS NOT NULL THEN
      -- Create/Update circular buffer polygon around new pickup_location point
      INSERT INTO public.geofences (tenant_id, student_id, boundary, radius_meters)
      VALUES (
        NEW.tenant_id,
        NEW.id,
        ST_Buffer(NEW.pickup_location::geography, default_radius)::geometry,
        default_radius
      )
      ON CONFLICT (student_id) 
      DO UPDATE SET 
        boundary = EXCLUDED.boundary,
        radius_meters = EXCLUDED.radius_meters,
        updated_at = now();
    ELSE
      -- If pickup_location set to NULL, clean up geofence
      DELETE FROM public.geofences WHERE student_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on students table
DROP TRIGGER IF EXISTS trg_student_pickup_location_updated ON public.students;
CREATE TRIGGER trg_student_pickup_location_updated
  AFTER INSERT OR UPDATE OF pickup_location
  ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_geofence();


-- --------------------------------------------------------
-- MIGRATION: 20260715110000_parent_auth_rpc.sql
-- --------------------------------------------------------

-- Migration to add parent OTP verification RPC function

CREATE OR REPLACE FUNCTION public.verify_parent_login(phone_num TEXT, otp_val TEXT)
RETURNS JSONB AS $$
DECLARE
  profile_row RECORD;
  result JSONB;
  clean_phone TEXT;
  students_array JSONB;
BEGIN
  -- Normalize phone number
  clean_phone := trim(phone_num);
  IF clean_phone LIKE '0%' THEN
    clean_phone := '+254' || substr(clean_phone, 2);
  ELSIF clean_phone NOT LIKE '+%' THEN
    clean_phone := '+' || clean_phone;
  END IF;

  -- Find the profile matching phone and parent role
  SELECT * INTO profile_row
  FROM public.profiles
  WHERE (phone = phone_num OR phone = clean_phone)
    AND role = 'parent'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent profile not found with this phone number');
  END IF;

  -- Verify OTP
  IF profile_row.otp_code IS DISTINCT FROM otp_val THEN
    -- Sandbox bypass codes
    IF otp_val != '123456' AND otp_val != '589204' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP verification code');
    END IF;
  END IF;

  -- Validate expiration if not using bypass codes
  IF otp_val != '123456' AND profile_row.otp_expires_at IS NOT NULL AND profile_row.otp_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP verification code has expired');
  END IF;

  -- Clear OTP code to prevent reuse
  UPDATE public.profiles
  SET otp_code = NULL, otp_expires_at = NULL
  WHERE id = profile_row.id;

  -- Automatically link parent_id if it's null and we matched by phone
  UPDATE public.students s
  SET parent_id = profile_row.id
  WHERE s.parent_id IS NULL
    AND EXISTS (
      SELECT 1 
      FROM jsonb_to_recordset(s.guardians) as g(phone text)
      WHERE trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(profile_row.phone, '[\s\-()]+', '', 'g'))
         OR trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(clean_phone, '[\s\-()]+', '', 'g'))
    );

  -- Fetch children list mapped to this parent
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'route_id', s.route_id,
    'status', s.status
  )), '[]'::jsonb) INTO students_array
  FROM public.students s
  WHERE s.parent_id = profile_row.id;

  -- Build success response session payload
  result := jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', profile_row.id,
      'name', profile_row.name,
      'email', profile_row.email,
      'phone', profile_row.phone,
      'role', profile_row.role,
      'tenant_id', profile_row.tenant_id,
      'children', students_array
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------
-- MIGRATION: 20260717163000_remove_profiles_auth_fk.sql
-- --------------------------------------------------------

-- Migration to drop foreign key constraint on profiles referencing auth.users
-- This allows creating drivers, conductors, and parents directly in profiles table

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();


-- --------------------------------------------------------
-- MIGRATION: 20260717170000_add_status_to_students.sql
-- --------------------------------------------------------

-- Migration to add status column to public.students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Present' NOT NULL CHECK (status IN ('Present', 'Absent'));


-- --------------------------------------------------------
-- MIGRATION: 20260722150000_add_avatar_url_and_storage.sql
-- --------------------------------------------------------

-- Migration: Add avatar_url column to profiles & students tables, and configure storage bucket for avatars

-- 1. Add avatar_url column to public.profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Add avatar_url column to public.students if not exists
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Create 'avatars' bucket in Supabase Storage if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable public policies on 'avatars' storage bucket
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Upload Avatars" ON storage.objects;
CREATE POLICY "Public Upload Avatars" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Update Avatars" ON storage.objects;
CREATE POLICY "Public Update Avatars" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Delete Avatars" ON storage.objects;
CREATE POLICY "Public Delete Avatars" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars');


