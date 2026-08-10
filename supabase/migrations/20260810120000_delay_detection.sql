-- Automatic trip delay detection & live ETA
-- Spec: context/architecture.md "Delay Detection & Live ETA".
-- Evaluated DB-side on telemetry ingestion (throttled), compares predicted stop
-- arrivals (bus position + remaining legs + dwell budgets) against the schedule
-- baseline, notifies affected parents via the existing notifications/alerts_queue
-- pipeline, and streams per-stop ETAs to mobile clients via Realtime.

-- ---------------------------------------------------------------------------
-- 1. Per-stop dwell (boarding) budget — part of the schedule baseline
-- ---------------------------------------------------------------------------
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS dwell_seconds NUMERIC DEFAULT 120 NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Delay SMS template (same token pattern as the other tenant templates)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_template_delay TEXT
  DEFAULT 'Hi {parent_name}, Bus Schedule Alert: The bus for {student_name} is running about {delay_mins} mins late. New estimated arrival at {stop_name} is {new_eta}. Bus {vehicle_plate}.' NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Widen alerts_queue.message_type — existing triggers already insert
--    'trip_status' / 'boarded' / 'dropped_off' which the original CHECK rejected
-- ---------------------------------------------------------------------------
ALTER TABLE public.alerts_queue DROP CONSTRAINT IF EXISTS alerts_queue_message_type_check;
ALTER TABLE public.alerts_queue ADD CONSTRAINT alerts_queue_message_type_check
  CHECK (message_type IN ('proximity', 'boarding', 'dropoff', 'boarded', 'dropped_off', 'trip_status', 'delay'));

-- ---------------------------------------------------------------------------
-- 4. Per-trip delay state (throttle + notification dedup/escalation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_delay_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    predicted_delay_seconds INTEGER DEFAULT 0 NOT NULL,
    last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_notified_delay_seconds INTEGER,
    notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_trip_delay_state UNIQUE (trip_id)
);

ALTER TABLE public.trip_delay_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins can view trip delay state inside Tenant" ON public.trip_delay_state;
CREATE POLICY "School Admins can view trip delay state inside Tenant" ON public.trip_delay_state
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage trip delay state" ON public.trip_delay_state;
CREATE POLICY "Super Admins can manage trip delay state" ON public.trip_delay_state
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 5. Live per-stop ETAs streamed to mobile clients (no PII: ids + timestamps)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_stop_etas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    stop_id UUID REFERENCES public.stops(id) ON DELETE CASCADE NOT NULL,
    predicted_arrival TIMESTAMP WITH TIME ZONE NOT NULL,
    delay_seconds INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_trip_stop_eta UNIQUE (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_stop_etas_route ON public.trip_stop_etas (route_id);

ALTER TABLE public.trip_stop_etas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins can view trip stop ETAs inside Tenant" ON public.trip_stop_etas;
CREATE POLICY "School Admins can view trip stop ETAs inside Tenant" ON public.trip_stop_etas
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
DROP POLICY IF EXISTS "Super Admins can manage trip stop ETAs" ON public.trip_stop_etas;
CREATE POLICY "Super Admins can manage trip stop ETAs" ON public.trip_stop_etas
  FOR ALL USING (public.jwt_role() = 'super_admin');
DROP POLICY IF EXISTS "Parents can view trip stop ETAs for child's active route" ON public.trip_stop_etas;
CREATE POLICY "Parents can view trip stop ETAs for child's active route" ON public.trip_stop_etas
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );

-- Stream ETA updates over Supabase Realtime (same publication as live_coordinates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'trip_stop_etas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_stop_etas;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Delay evaluation trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_trip_delay()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  trip_row RECORD;
  sched_row RECORD;
  state_row RECORD;
  next_stop RECORD;
  stop_rec RECORD;
  student_row RECORD;
  vehicle_plate TEXT;
  sms_enabled BOOLEAN;
  template_delay TEXT;
  last_arrived_seq INT;
  departure_text TEXT;
  scheduled_departure TIMESTAMP WITH TIME ZONE;
  travel_to_next NUMERIC := 0;
  dwell_before_next NUMERIC := 0;
  leg_fraction NUMERIC;
  remaining_leg_seconds NUMERIC;
  predicted_next TIMESTAMP WITH TIME ZONE;
  scheduled_next TIMESTAMP WITH TIME ZONE;
  delay_secs INT;
  running_predicted TIMESTAMP WITH TIME ZONE;
  prev_dwell NUMERIC := 0;
  notify_needed BOOLEAN := FALSE;
  delay_mins INT;
  student_eta TIMESTAMP WITH TIME ZONE;
  new_eta_str TEXT;
  custom_msg TEXT;
BEGIN
  -- Resolve the active trip for this vehicle/route today (telemetry has no trip_id)
  SELECT t.id, t.tenant_id, t.schedule_id, t.route_id, t.vehicle_id, t.trip_date, t.custom_departure_time
  INTO trip_row
  FROM public.trips t
  WHERE t.vehicle_id = NEW.vehicle_id
    AND t.route_id = NEW.route_id
    AND t.trip_date = CURRENT_DATE
    AND t.status = 'in_progress'
  ORDER BY t.started_at DESC NULLS LAST
  LIMIT 1;

  IF trip_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Throttle: evaluate at most once every 30 seconds per trip
  SELECT * INTO state_row FROM public.trip_delay_state WHERE trip_id = trip_row.id;
  IF state_row.id IS NOT NULL
     AND state_row.last_evaluated_at > timezone('utc'::text, now()) - INTERVAL '30 seconds' THEN
    RETURN NEW;
  END IF;

  SELECT direction, departure_time INTO sched_row
  FROM public.schedules
  WHERE id = trip_row.schedule_id;

  IF sched_row.departure_time IS NULL THEN
    RETURN NEW; -- no schedule baseline to compare against
  END IF;

  -- Baseline departure: an admin-announced custom departure (manual delay) wins.
  -- Schedule times are local East Africa Time.
  departure_text := COALESCE(NULLIF(trip_row.custom_departure_time, ''), sched_row.departure_time::text);
  BEGIN
    scheduled_departure := (trip_row.trip_date::text || ' ' || departure_text)::timestamp AT TIME ZONE 'Africa/Nairobi';
  EXCEPTION WHEN OTHERS THEN
    -- custom_departure_time is free text; fall back to the schedule time
    scheduled_departure := (trip_row.trip_date::text || ' ' || sched_row.departure_time::text)::timestamp AT TIME ZONE 'Africa/Nairobi';
  END;

  -- Route progress: highest stop sequence already reached today
  SELECT COALESCE(MAX(st.sequence_no), 0) INTO last_arrived_seq
  FROM public.stop_arrivals_log sal
  JOIN public.stops st ON st.id = sal.stop_id
  WHERE sal.route_id = NEW.route_id
    AND sal.trip_date = CURRENT_DATE;

  -- Next stop still ahead of the bus
  SELECT id, name, location, sequence_no, duration_from_prev_seconds, distance_from_prev_meters, dwell_seconds
  INTO next_stop
  FROM public.stops
  WHERE route_id = NEW.route_id
    AND sequence_no > last_arrived_seq
  ORDER BY sequence_no ASC
  LIMIT 1;

  IF next_stop.id IS NULL THEN
    RETURN NEW; -- all stops served
  END IF;

  -- Remaining travel time on the current leg via geometric progress along it.
  -- Clamp the fraction to 1.5 so an off-route detour cannot explode the estimate.
  IF next_stop.distance_from_prev_meters IS NOT NULL AND next_stop.distance_from_prev_meters > 0 THEN
    leg_fraction := LEAST(
      ST_Distance(NEW.coordinates::geography, next_stop.location::geography) / next_stop.distance_from_prev_meters,
      1.5
    );
  ELSE
    leg_fraction := 1;
  END IF;
  remaining_leg_seconds := GREATEST(COALESCE(next_stop.duration_from_prev_seconds, 0), 0) * leg_fraction;

  predicted_next := timezone('utc'::text, now()) + make_interval(secs => remaining_leg_seconds);

  -- Scheduled arrival at the next stop:
  -- departure + all travel legs up to it + dwell budgets of the stops before it
  SELECT
    COALESCE(SUM(duration_from_prev_seconds), 0),
    COALESCE(SUM(dwell_seconds) FILTER (WHERE sequence_no < next_stop.sequence_no), 0)
  INTO travel_to_next, dwell_before_next
  FROM public.stops
  WHERE route_id = NEW.route_id
    AND sequence_no <= next_stop.sequence_no;

  scheduled_next := scheduled_departure + make_interval(secs => travel_to_next + dwell_before_next);
  delay_secs := GREATEST(EXTRACT(EPOCH FROM (predicted_next - scheduled_next))::INT, 0);

  -- Upsert live ETAs for every remaining stop (delay propagates uniformly)
  running_predicted := predicted_next;
  prev_dwell := 0;
  FOR stop_rec IN
    SELECT id, sequence_no, duration_from_prev_seconds, dwell_seconds
    FROM public.stops
    WHERE route_id = NEW.route_id
      AND sequence_no >= next_stop.sequence_no
    ORDER BY sequence_no ASC
  LOOP
    IF stop_rec.sequence_no > next_stop.sequence_no THEN
      running_predicted := running_predicted
        + make_interval(secs => prev_dwell + GREATEST(COALESCE(stop_rec.duration_from_prev_seconds, 0), 0));
    END IF;
    prev_dwell := COALESCE(stop_rec.dwell_seconds, 120);

    INSERT INTO public.trip_stop_etas (tenant_id, trip_id, route_id, stop_id, predicted_arrival, delay_seconds, updated_at)
    VALUES (trip_row.tenant_id, trip_row.id, NEW.route_id, stop_rec.id, running_predicted, delay_secs, timezone('utc'::text, now()))
    ON CONFLICT (trip_id, stop_id) DO UPDATE SET
      predicted_arrival = EXCLUDED.predicted_arrival,
      delay_seconds = EXCLUDED.delay_seconds,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  -- Notification policy: first alert at >= 5 min, escalate when the delay has
  -- grown >= 10 min beyond the last notified value (per trip, not per day)
  IF delay_secs >= 300 AND (
       state_row.id IS NULL
       OR state_row.last_notified_delay_seconds IS NULL
       OR delay_secs >= state_row.last_notified_delay_seconds + 600
     ) THEN
    notify_needed := TRUE;
  END IF;

  INSERT INTO public.trip_delay_state (tenant_id, trip_id, predicted_delay_seconds, last_evaluated_at, last_notified_delay_seconds, notified_at)
  VALUES (
    trip_row.tenant_id,
    trip_row.id,
    delay_secs,
    timezone('utc'::text, now()),
    CASE WHEN notify_needed THEN delay_secs ELSE NULL END,
    CASE WHEN notify_needed THEN timezone('utc'::text, now()) ELSE NULL END
  )
  ON CONFLICT (trip_id) DO UPDATE SET
    predicted_delay_seconds = EXCLUDED.predicted_delay_seconds,
    last_evaluated_at = EXCLUDED.last_evaluated_at,
    last_notified_delay_seconds = CASE WHEN notify_needed THEN delay_secs ELSE trip_delay_state.last_notified_delay_seconds END,
    notified_at = CASE WHEN notify_needed THEN timezone('utc'::text, now()) ELSE trip_delay_state.notified_at END;

  IF notify_needed THEN
    SELECT sms_notifications_enabled, sms_template_delay
    INTO sms_enabled, template_delay
    FROM public.tenant_configs
    WHERE tenant_id = trip_row.tenant_id;

    IF sms_enabled IS NULL THEN
      sms_enabled := FALSE;
    END IF;
    IF template_delay IS NULL OR template_delay = '' THEN
      template_delay := 'Hi {parent_name}, Bus Schedule Alert: The bus for {student_name} is running about {delay_mins} mins late. New estimated arrival at {stop_name} is {new_eta}. Bus {vehicle_plate}.';
    END IF;

    SELECT license_plate INTO vehicle_plate FROM public.vehicles WHERE id = trip_row.vehicle_id;
    IF vehicle_plate IS NULL THEN
      vehicle_plate := 'assigned bus';
    END IF;

    delay_mins := CEIL(delay_secs / 60.0);

    -- Affected parents: students whose direction-relevant stop is still ahead
    FOR student_row IN
      SELECT
        s.id as student_id,
        s.name as student_name,
        s.parent_id,
        p.name as parent_name,
        st.id as stop_id,
        st.name as stop_name
      FROM public.students s
      JOIN public.profiles p ON s.parent_id = p.id
      JOIN public.stops st ON st.id = CASE
        WHEN sched_row.direction = 'SCHOOL_TO_HOME' THEN s.dropoff_stop_id
        ELSE s.pickup_stop_id
      END
      WHERE s.route_id = NEW.route_id
        AND st.sequence_no >= next_stop.sequence_no
    LOOP
      SELECT predicted_arrival INTO student_eta
      FROM public.trip_stop_etas
      WHERE trip_id = trip_row.id AND stop_id = student_row.stop_id;

      new_eta_str := to_char(COALESCE(student_eta, predicted_next) AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');

      custom_msg := replace(template_delay, '{parent_name}', COALESCE(student_row.parent_name, 'Parent'));
      custom_msg := replace(custom_msg, '{student_name}', COALESCE(student_row.student_name, 'your child'));
      custom_msg := replace(custom_msg, '{stop_name}', COALESCE(student_row.stop_name, 'the stop'));
      custom_msg := replace(custom_msg, '{delay_mins}', delay_mins::text);
      custom_msg := replace(custom_msg, '{new_eta}', new_eta_str);
      custom_msg := replace(custom_msg, '{vehicle_plate}', vehicle_plate);

      -- In-app / push notification (always)
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (trip_row.tenant_id, student_row.parent_id, 'Trip Running Late', custom_msg, 'delay');

      -- SMS (if enabled; demo tenants are dry-run via trg_block_demo_tenant_alerts)
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (trip_row.tenant_id, student_row.student_id, student_row.parent_id, 'delay', custom_msg);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Invariant: auxiliary alerting must never abort telemetry ingestion
  RAISE WARNING 'evaluate_trip_delay failed (telemetry insert preserved): %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_trip_delay() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_trip_delay() FROM anon;
REVOKE ALL ON FUNCTION public.evaluate_trip_delay() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_trip_delay() TO service_role;

DROP TRIGGER IF EXISTS on_live_coordinate_delay_check ON public.live_coordinates;
CREATE TRIGGER on_live_coordinate_delay_check
  AFTER INSERT ON public.live_coordinates
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_trip_delay();

-- Data API exposure (RLS still gates rows; parent JWT required for SELECT)
GRANT SELECT ON public.trip_stop_etas TO anon, authenticated;
GRANT SELECT ON public.trip_delay_state TO authenticated;
