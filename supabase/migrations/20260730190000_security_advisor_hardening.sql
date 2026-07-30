-- Security hardening: clear sandbox-open RLS policies and lock down SECURITY DEFINER RPCs.
-- Note: public.spatial_ref_sys / PostGIS extension warnings are PostGIS-owned false positives;
-- we cannot ENABLE RLS on spatial_ref_sys (must be owner of table). Safe to ignore until
-- Supabase advisor excludes PostGIS system tables.

-- ---------------------------------------------------------------------------
-- Drop sandbox "Allow public *" policies (rls_policy_always_true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read of routes" ON public.routes;
DROP POLICY IF EXISTS "Allow public read of schedules" ON public.schedules;
DROP POLICY IF EXISTS "Allow public read of stops" ON public.stops;
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
DROP POLICY IF EXISTS "Allow public update of students" ON public.students;
DROP POLICY IF EXISTS "Allow public insert of students" ON public.students;
DROP POLICY IF EXISTS "Allow public delete of students" ON public.students;
DROP POLICY IF EXISTS "Allow public insert of live_coordinates" ON public.live_coordinates;

DROP POLICY IF EXISTS "Allow public read of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public insert of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public update of vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public delete of vehicles" ON public.vehicles;

DROP POLICY IF EXISTS "Allow public read of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update of trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public delete of trips" ON public.trips;

DROP POLICY IF EXISTS "Allow public read of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public insert of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public update of trip_manifests" ON public.trip_manifests;
DROP POLICY IF EXISTS "Allow public delete of trip_manifests" ON public.trip_manifests;

DROP POLICY IF EXISTS "Database Triggers can write alerts" ON public.alerts_queue;
DROP POLICY IF EXISTS "Admins and service role can manage eta queue" ON public.eta_calculation_queue;
DROP POLICY IF EXISTS "Edge functions / Webhooks can read & process queues" ON public.alerts_queue;
DROP POLICY IF EXISTS "Super Admins manage alerts queue" ON public.alerts_queue;
DROP POLICY IF EXISTS "Super Admins manage eta queue" ON public.eta_calculation_queue;

CREATE POLICY "Super Admins manage alerts queue" ON public.alerts_queue
  FOR ALL
  USING (public.jwt_role() = 'super_admin')
  WITH CHECK (public.jwt_role() = 'super_admin');

CREATE POLICY "Super Admins manage eta queue" ON public.eta_calculation_queue
  FOR ALL
  USING (public.jwt_role() = 'super_admin')
  WITH CHECK (public.jwt_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: lock search_path; revoke public execute
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.jwt_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.jwt_tenant_id() SET search_path = public, pg_temp;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'handle_new_user',
        'check_geofence_triggers',
        'on_manifest_attendance_update',
        'on_trip_status_update',
        'sync_student_geofence',
        'trigger_alert_webhook',
        'trigger_push_webhook',
        'trigger_eta_webhook',
        'reorder_stops',
        'verify_driver_login',
        'verify_parent_login'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_parent_login(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_stops(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_geofence_triggers() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_manifest_attendance_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_trip_status_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_student_geofence() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_alert_webhook() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_push_webhook() TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: remove open upload/list policies; owner-scoped writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Delete Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar owner update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar owner delete" ON storage.objects;

-- No broad SELECT on public bucket (avoids listing warning). Public object URLs still work.
CREATE POLICY "Avatar owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatar owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatar owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
