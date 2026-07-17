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
CREATE POLICY "Super Admins can manage all Tenants" ON public.tenants
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Tenant Admins can view own Tenant details" ON public.tenants
  FOR SELECT USING (id = public.jwt_tenant_id());

-- Profiles Policies
CREATE POLICY "Users can access own Profile" ON public.profiles
  FOR ALL USING (id = auth.uid());
CREATE POLICY "School Admins can manage profiles inside Tenant" ON public.profiles
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage all Profiles" ON public.profiles
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Drivers can view Parent contacts inside Tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
CREATE POLICY "Parents can view Driver profiles inside Tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'parent');

-- Vehicles Policies
CREATE POLICY "School Admins can manage Vehicles inside Tenant" ON public.vehicles
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage all Vehicles" ON public.vehicles
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Drivers can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
CREATE POLICY "Parents can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
  );

-- Routes Policies
CREATE POLICY "School Admins can manage Routes inside Tenant" ON public.routes
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage all Routes" ON public.routes
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Drivers can read Routes inside Tenant" ON public.routes
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
CREATE POLICY "Parents can read Routes of their children" ON public.routes
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );

-- Students Policies
CREATE POLICY "School Admins can manage Students inside Tenant" ON public.students
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage all Students" ON public.students
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Drivers can read active checklists of assigned Routes" ON public.students
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');
CREATE POLICY "Parents can view their own children records" ON public.students
  FOR SELECT USING (parent_id = auth.uid());

-- Live Coordinates Policies
CREATE POLICY "Drivers can stream telemetry coordinates" ON public.live_coordinates
  FOR INSERT WITH CHECK (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'driver'
  );
CREATE POLICY "School Admins can view telemetry coordinates inside Tenant" ON public.live_coordinates
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can view all telemetry" ON public.live_coordinates
  FOR SELECT USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Parents can view live coordinates for child's active route" ON public.live_coordinates
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );

-- Geofences Policies
CREATE POLICY "School Admins can manage Geofences inside Tenant" ON public.geofences
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage all Geofences" ON public.geofences
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Parents can read geofences mapped to their children" ON public.geofences
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

-- Sent Proximity Alerts Policies
CREATE POLICY "School Admins can view historical dispatches" ON public.sent_proximity_alerts
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Super Admins can manage alerts logs" ON public.sent_proximity_alerts
  FOR ALL USING (public.jwt_role() = 'super_admin');
CREATE POLICY "Parents can view alerts sent for their children" ON public.sent_proximity_alerts
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

-- Alerts Queue Policies
CREATE POLICY "Database Triggers can write alerts" ON public.alerts_queue
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Edge functions / Webhooks can read & process queues" ON public.alerts_queue
  FOR ALL USING (public.jwt_role() = 'super_admin');
