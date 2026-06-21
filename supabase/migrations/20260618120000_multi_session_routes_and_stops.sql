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
CREATE POLICY "School Admins can manage Stops" ON public.stops
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Drivers and Conductors can view Stops" ON public.stops
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() IN ('driver', 'conductor'));

CREATE POLICY "School Admins can manage Schedules" ON public.schedules
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Drivers and Conductors can view Schedules" ON public.schedules
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() IN ('driver', 'conductor'));

CREATE POLICY "School Admins can manage Trips" ON public.trips
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Drivers can manage own daily Trips" ON public.trips
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND (driver_id = auth.uid() OR public.jwt_role() = 'school_admin'));

CREATE POLICY "Drivers can update Trip Manifests" ON public.trip_manifests
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND (public.jwt_role() IN ('driver', 'school_admin')));
