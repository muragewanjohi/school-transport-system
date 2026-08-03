-- Request Demo leads + Demo School tenant (is_demo), access tokens, SMS guard

-- ---------------------------------------------------------------------------
-- Tenants: demo flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tenants_is_demo_idx ON public.tenants (is_demo)
  WHERE is_demo = true;

-- ---------------------------------------------------------------------------
-- Demo request leads (apex /request-demo form)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  school_name TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  fleet_size TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'request-demo',
  ip_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform super admins read demo_requests" ON public.demo_requests;
CREATE POLICY "Platform super admins read demo_requests" ON public.demo_requests
  FOR SELECT TO authenticated
  USING (public.jwt_role() = 'super_admin');

GRANT SELECT ON public.demo_requests TO authenticated;
GRANT ALL ON public.demo_requests TO service_role;

-- ---------------------------------------------------------------------------
-- Time-boxed explore tokens (Phase 3 gated demo access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demo_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_request_id UUID REFERENCES public.demo_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS demo_access_tokens_expires_idx
  ON public.demo_access_tokens (expires_at);

ALTER TABLE public.demo_access_tokens ENABLE ROW LEVEL SECURITY;

-- No authenticated client policies — service role only
GRANT ALL ON public.demo_access_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- Block alerts_queue inserts for demo tenants (hard SMS kill-switch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_demo_tenant_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = NEW.tenant_id AND t.is_demo = true
  ) THEN
    -- Dry-run: keep row for visibility but mark processed so webhooks/edge skip send
    NEW.processed := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_demo_tenant_alerts ON public.alerts_queue;
CREATE TRIGGER trg_block_demo_tenant_alerts
  BEFORE INSERT ON public.alerts_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.block_demo_tenant_alerts();

REVOKE ALL ON FUNCTION public.block_demo_tenant_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_demo_tenant_alerts() TO service_role;

-- ---------------------------------------------------------------------------
-- Seed Demo School (synthetic data only — fake phones never receive SMS)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant_id UUID := 'a0000000-0000-4000-8000-000000000001';
  v_campus_id UUID := 'a0000000-0000-4000-8000-000000000002';
  v_route_west UUID := 'a0000000-0000-4000-8000-000000000011';
  v_route_kilimani UUID := 'a0000000-0000-4000-8000-000000000012';
  v_route_lavington UUID := 'a0000000-0000-4000-8000-000000000013';
  v_vehicle_1 UUID := 'a0000000-0000-4000-8000-000000000021';
  v_vehicle_2 UUID := 'a0000000-0000-4000-8000-000000000022';
  v_driver_1 UUID := 'a0000000-0000-4000-8000-000000000031';
  v_driver_2 UUID := 'a0000000-0000-4000-8000-000000000032';
  v_parent_1 UUID := 'a0000000-0000-4000-8000-000000000041';
  v_parent_2 UUID := 'a0000000-0000-4000-8000-000000000042';
  v_parent_3 UUID := 'a0000000-0000-4000-8000-000000000043';
  v_stop_w1 UUID := 'a0000000-0000-4000-8000-000000000051';
  v_stop_w2 UUID := 'a0000000-0000-4000-8000-000000000052';
  v_stop_w3 UUID := 'a0000000-0000-4000-8000-000000000053';
  v_stop_k1 UUID := 'a0000000-0000-4000-8000-000000000054';
  v_stop_k2 UUID := 'a0000000-0000-4000-8000-000000000055';
  v_stop_l1 UUID := 'a0000000-0000-4000-8000-000000000056';
  v_stop_l2 UUID := 'a0000000-0000-4000-8000-000000000057';
  v_sched_w UUID := 'a0000000-0000-4000-8000-000000000061';
  v_sched_k UUID := 'a0000000-0000-4000-8000-000000000062';
  v_sched_l UUID := 'a0000000-0000-4000-8000-000000000063';
  v_trip_active UUID := 'a0000000-0000-4000-8000-000000000071';
  i INT;
BEGIN
  INSERT INTO public.tenants (id, name, domain, status, contact_email, contact_phone, is_demo)
  VALUES (
    v_tenant_id,
    'OnTheBus Demo School',
    'demo',
    'active',
    'demo@onthebus.app',
    '+254700000000',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      domain = EXCLUDED.domain,
      status = 'active',
      deleted_at = NULL,
      is_demo = true,
      updated_at = timezone('utc'::text, now());

  -- If domain conflict on another row, skip seed (manual resolution needed)
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    RAISE NOTICE 'Demo tenant seed skipped — id conflict unresolved';
    RETURN;
  END IF;

  -- Ensure domain is demo even if row existed with different domain via unique index
  UPDATE public.tenants
  SET domain = 'demo', is_demo = true, deleted_at = NULL, status = 'active'
  WHERE id = v_tenant_id;

  INSERT INTO public.campuses (id, tenant_id, name, latitude, longitude, location, status)
  VALUES (
    v_campus_id,
    v_tenant_id,
    'Demo Nairobi Campus',
    -1.2921,
    36.8219,
    ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326),
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      location = EXCLUDED.location,
      deleted_at = NULL,
      status = 'active';

  INSERT INTO public.billing_status (
    tenant_id, plan_name, price_desc, is_paid,
    students_count, active_routes_count, drivers_count,
    sms_used_this_month, sms_limit_expected, campus_monthly_fee_kes
  )
  VALUES (
    v_tenant_id, 'Demo', 'Demo — not billed', true,
    24, 3, 2, 0, 0, 0
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET plan_name = 'Demo',
      price_desc = 'Demo — not billed',
      is_paid = true,
      campus_monthly_fee_kes = 0,
      updated_at = timezone('utc'::text, now());

  INSERT INTO public.tenant_configs (tenant_id, school_name, school_phone, school_email, school_address)
  VALUES (
    v_tenant_id,
    'OnTheBus Demo School',
    '+254700000000',
    'demo@onthebus.app',
    'Nairobi, Kenya'
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET school_name = EXCLUDED.school_name,
      updated_at = timezone('utc'::text, now());

  -- Staff profiles (no auth.users — FK dropped; sales uses separate auth account)
  INSERT INTO public.profiles (id, tenant_id, role, name, email, phone, status, admin_role)
  VALUES
    (v_driver_1, v_tenant_id, 'driver', 'Demo Driver West', 'driver.west@demo.onthebus.app', '+254700000101', 'Available', NULL),
    (v_driver_2, v_tenant_id, 'driver', 'Demo Driver East', 'driver.east@demo.onthebus.app', '+254700000102', 'Available', NULL),
    (v_parent_1, v_tenant_id, 'parent', 'Parent Akinyi', 'parent.akinyi@demo.onthebus.app', '+254700000201', 'Available', NULL),
    (v_parent_2, v_tenant_id, 'parent', 'Parent Otieno', 'parent.otieno@demo.onthebus.app', '+254700000202', 'Available', NULL),
    (v_parent_3, v_tenant_id, 'parent', 'Parent Wanjiku', 'parent.wanjiku@demo.onthebus.app', '+254700000203', 'Available', NULL)
  ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role;

  INSERT INTO public.vehicles (
    id, tenant_id, campus_id, license_plate, model, capacity, status, active_driver_id
  )
  VALUES
    (v_vehicle_1, v_tenant_id, v_campus_id, 'KDA 001D', 'Toyota Coaster', 30, 'Active', v_driver_1),
    (v_vehicle_2, v_tenant_id, v_campus_id, 'KDA 002D', 'Isuzu NQR', 35, 'Active', v_driver_2)
  ON CONFLICT (id) DO UPDATE
  SET license_plate = EXCLUDED.license_plate,
      model = EXCLUDED.model,
      campus_id = EXCLUDED.campus_id,
      active_driver_id = EXCLUDED.active_driver_id,
      status = 'Active';

  INSERT INTO public.routes (id, tenant_id, campus_id, name, path)
  VALUES
    (
      v_route_west, v_tenant_id, v_campus_id, 'Westlands Morning',
      ST_SetSRID(ST_MakeLine(ARRAY[
        ST_MakePoint(36.8095, -1.2670),
        ST_MakePoint(36.8120, -1.2750),
        ST_MakePoint(36.8219, -1.2921)
      ]), 4326)
    ),
    (
      v_route_kilimani, v_tenant_id, v_campus_id, 'Kilimani Morning',
      ST_SetSRID(ST_MakeLine(ARRAY[
        ST_MakePoint(36.7870, -1.2920),
        ST_MakePoint(36.8000, -1.2900),
        ST_MakePoint(36.8219, -1.2921)
      ]), 4326)
    ),
    (
      v_route_lavington, v_tenant_id, v_campus_id, 'Lavington Afternoon',
      ST_SetSRID(ST_MakeLine(ARRAY[
        ST_MakePoint(36.8219, -1.2921),
        ST_MakePoint(36.7750, -1.2800),
        ST_MakePoint(36.7680, -1.2750)
      ]), 4326)
    )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      path = EXCLUDED.path,
      campus_id = EXCLUDED.campus_id;

  INSERT INTO public.stops (id, tenant_id, campus_id, route_id, name, location, sequence_no, stop_type)
  VALUES
    (v_stop_w1, v_tenant_id, v_campus_id, v_route_west, 'Riverside Drive', ST_SetSRID(ST_MakePoint(36.8095, -1.2670), 4326), 1, 'PICKUP'),
    (v_stop_w2, v_tenant_id, v_campus_id, v_route_west, 'Westlands Roundabout', ST_SetSRID(ST_MakePoint(36.8120, -1.2750), 4326), 2, 'BOTH'),
    (v_stop_w3, v_tenant_id, v_campus_id, v_route_west, 'Demo Campus Gate', ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326), 3, 'DROPOFF'),
    (v_stop_k1, v_tenant_id, v_campus_id, v_route_kilimani, 'Yaya Centre', ST_SetSRID(ST_MakePoint(36.7870, -1.2920), 4326), 1, 'PICKUP'),
    (v_stop_k2, v_tenant_id, v_campus_id, v_route_kilimani, 'Demo Campus Gate', ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326), 2, 'DROPOFF'),
    (v_stop_l1, v_tenant_id, v_campus_id, v_route_lavington, 'Demo Campus Gate', ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326), 1, 'PICKUP'),
    (v_stop_l2, v_tenant_id, v_campus_id, v_route_lavington, 'Lavington Green', ST_SetSRID(ST_MakePoint(36.7680, -1.2750), 4326), 2, 'DROPOFF')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      location = EXCLUDED.location,
      sequence_no = EXCLUDED.sequence_no;

  INSERT INTO public.schedules (
    id, tenant_id, campus_id, route_id, vehicle_id, name, departure_time, direction, target_grades, days_of_week
  )
  VALUES
    (v_sched_w, v_tenant_id, v_campus_id, v_route_west, v_vehicle_1, 'Westlands AM', '06:45', 'HOME_TO_SCHOOL', ARRAY['Grade 1','Grade 2','Grade 3','Grade 4'], '{1,2,3,4,5}'),
    (v_sched_k, v_tenant_id, v_campus_id, v_route_kilimani, v_vehicle_2, 'Kilimani AM', '07:00', 'HOME_TO_SCHOOL', ARRAY['Grade 3','Grade 4','Grade 5'], '{1,2,3,4,5}'),
    (v_sched_l, v_tenant_id, v_campus_id, v_route_lavington, v_vehicle_1, 'Lavington PM', '15:30', 'SCHOOL_TO_HOME', ARRAY['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5'], '{1,2,3,4,5}')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      departure_time = EXCLUDED.departure_time,
      vehicle_id = EXCLUDED.vehicle_id;

  -- ~24 synthetic students across routes
  FOR i IN 1..24 LOOP
    INSERT INTO public.students (
      id, tenant_id, campus_id, name, parent_id, route_id,
      pickup_stop_id, dropoff_stop_id, schedule_ids,
      nfc_card_hash, grade, class_name, status, guardians,
      pickup_location, address
    )
    VALUES (
      ('a0000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid,
      v_tenant_id,
      v_campus_id,
      CASE (i % 8)
        WHEN 0 THEN 'Amina Demo ' || i
        WHEN 1 THEN 'Brian Demo ' || i
        WHEN 2 THEN 'Chloe Demo ' || i
        WHEN 3 THEN 'David Demo ' || i
        WHEN 4 THEN 'Elena Demo ' || i
        WHEN 5 THEN 'Felix Demo ' || i
        WHEN 6 THEN 'Grace Demo ' || i
        ELSE 'Hassan Demo ' || i
      END,
      CASE
        WHEN i % 3 = 1 THEN v_parent_1
        WHEN i % 3 = 2 THEN v_parent_2
        ELSE v_parent_3
      END,
      CASE
        WHEN i <= 10 THEN v_route_west
        WHEN i <= 18 THEN v_route_kilimani
        ELSE v_route_lavington
      END,
      CASE
        WHEN i <= 10 THEN v_stop_w1
        WHEN i <= 18 THEN v_stop_k1
        ELSE v_stop_l1
      END,
      CASE
        WHEN i <= 10 THEN v_stop_w3
        WHEN i <= 18 THEN v_stop_k2
        ELSE v_stop_l2
      END,
      CASE
        WHEN i <= 10 THEN ARRAY[v_sched_w]
        WHEN i <= 18 THEN ARRAY[v_sched_k]
        ELSE ARRAY[v_sched_l]
      END,
      'DEMO-NFC-' || lpad(i::text, 4, '0'),
      'Grade ' || ((i % 5) + 1)::text,
      ((i % 5) + 1)::text || CASE WHEN i % 2 = 0 THEN ' Blue' ELSE ' Green' END,
      CASE WHEN i % 7 = 0 THEN 'Absent' ELSE 'Present' END,
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Guardian Demo ' || i,
          'phone', '+25470000' || lpad((200 + i)::text, 4, '0')
        )
      ),
      ST_SetSRID(ST_MakePoint(36.80 + (i * 0.001), -1.27 - (i * 0.0008)), 4326),
      'Demo Address ' || i || ', Nairobi'
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        route_id = EXCLUDED.route_id,
        status = EXCLUDED.status,
        nfc_card_hash = EXCLUDED.nfc_card_hash;
  END LOOP;

  -- Active trip for map demos (today) — clear same-day schedule conflict first
  DELETE FROM public.trips
  WHERE schedule_id = v_sched_w AND trip_date = CURRENT_DATE AND id <> v_trip_active;

  INSERT INTO public.trips (
    id, tenant_id, campus_id, schedule_id, route_id, vehicle_id, driver_id,
    trip_date, status, started_at
  )
  VALUES (
    v_trip_active,
    v_tenant_id,
    v_campus_id,
    v_sched_w,
    v_route_west,
    v_vehicle_1,
    v_driver_1,
    CURRENT_DATE,
    'in_progress',
    timezone('utc'::text, now()) - interval '25 minutes'
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'in_progress',
      started_at = timezone('utc'::text, now()) - interval '25 minutes',
      trip_date = CURRENT_DATE,
      vehicle_id = v_vehicle_1,
      driver_id = v_driver_1,
      schedule_id = v_sched_w,
      route_id = v_route_west;

  -- Canned live coordinates along Westlands route (recent timestamps).
  -- Geofence triggers expect trip context; disable user triggers for seed only.
  ALTER TABLE public.live_coordinates DISABLE TRIGGER USER;

  DELETE FROM public.live_coordinates WHERE tenant_id = v_tenant_id;

  INSERT INTO public.live_coordinates (tenant_id, vehicle_id, route_id, coordinates, speed, bearing, created_at)
  VALUES
    (v_tenant_id, v_vehicle_1, v_route_west, ST_SetSRID(ST_MakePoint(36.8095, -1.2670), 4326), 28, 160, timezone('utc'::text, now()) - interval '8 minutes'),
    (v_tenant_id, v_vehicle_1, v_route_west, ST_SetSRID(ST_MakePoint(36.8105, -1.2700), 4326), 32, 165, timezone('utc'::text, now()) - interval '6 minutes'),
    (v_tenant_id, v_vehicle_1, v_route_west, ST_SetSRID(ST_MakePoint(36.8120, -1.2750), 4326), 25, 170, timezone('utc'::text, now()) - interval '4 minutes'),
    (v_tenant_id, v_vehicle_1, v_route_west, ST_SetSRID(ST_MakePoint(36.8160, -1.2820), 4326), 30, 155, timezone('utc'::text, now()) - interval '2 minutes'),
    (v_tenant_id, v_vehicle_1, v_route_west, ST_SetSRID(ST_MakePoint(36.8190, -1.2880), 4326), 22, 150, timezone('utc'::text, now()) - interval '30 seconds');

  ALTER TABLE public.live_coordinates ENABLE TRIGGER USER;

END;
$$;
