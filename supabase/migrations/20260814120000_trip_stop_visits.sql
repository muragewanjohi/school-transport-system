-- Per-trip stop outcomes: completed, visited (drive-through), skipped (not visited).
-- Dwell time is stored as arrived_at / departed_at / dwell_seconds.
-- Admin alerts are tenant-scoped; messages must not include student PII.

DO $$ BEGIN
    CREATE TYPE public.trip_stop_visit_outcome AS ENUM ('completed', 'visited', 'skipped');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.trip_stop_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    stop_id UUID REFERENCES public.stops(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    outcome public.trip_stop_visit_outcome NOT NULL,
    arrived_at TIMESTAMP WITH TIME ZONE,
    departed_at TIMESTAMP WITH TIME ZONE,
    dwell_seconds INT NOT NULL DEFAULT 0,
    students_actioned INT NOT NULL DEFAULT 0,
    alerted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_trip_stop_visit UNIQUE (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_stop_visits_tenant_created
  ON public.trip_stop_visits (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_stop_visits_trip
  ON public.trip_stop_visits (trip_id);

ALTER TABLE public.trip_stop_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins can view trip stop visits inside Tenant" ON public.trip_stop_visits;
CREATE POLICY "School Admins can view trip stop visits inside Tenant" ON public.trip_stop_visits
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

DROP POLICY IF EXISTS "Super Admins can manage trip stop visits" ON public.trip_stop_visits;
CREATE POLICY "Super Admins can manage trip stop visits" ON public.trip_stop_visits
  FOR ALL USING (public.jwt_role() = 'super_admin');

GRANT SELECT ON public.trip_stop_visits TO authenticated;
GRANT ALL ON public.trip_stop_visits TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'trip_stop_visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_stop_visits;
  END IF;
END;
$$;
