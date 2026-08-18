-- Min stop dwell, per-trip parent alert kinds (campus_exit + 500 m approach),
-- and rewrite geofence/trip-start alerting. Auxiliary logic must never abort GPS inserts.

-- ---------------------------------------------------------------------------
-- tenant_configs: min dwell + campus-exit SMS template
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS min_stop_dwell_seconds INT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS sms_template_campus_exit TEXT NOT NULL DEFAULT
    'Hi {parent_name}, Bus {vehicle_plate} has left school. {student_name} will be {action} at {stop_name} around {eta_time} (about {duration_mins} min).';

ALTER TABLE public.tenant_configs DROP CONSTRAINT IF EXISTS tenant_configs_min_stop_dwell_seconds_check;
ALTER TABLE public.tenant_configs
  ADD CONSTRAINT tenant_configs_min_stop_dwell_seconds_check
  CHECK (min_stop_dwell_seconds >= 60 AND min_stop_dwell_seconds <= 180);

-- ---------------------------------------------------------------------------
-- sent_proximity_alerts: two kinds per student per trip
-- ---------------------------------------------------------------------------
ALTER TABLE public.sent_proximity_alerts
  ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS alert_kind TEXT NOT NULL DEFAULT 'proximity';

ALTER TABLE public.sent_proximity_alerts DROP CONSTRAINT IF EXISTS sent_proximity_alerts_alert_kind_check;
ALTER TABLE public.sent_proximity_alerts
  ADD CONSTRAINT sent_proximity_alerts_alert_kind_check
  CHECK (alert_kind IN ('campus_exit', 'proximity'));

ALTER TABLE public.sent_proximity_alerts DROP CONSTRAINT IF EXISTS unique_student_alert_per_day;

DROP INDEX IF EXISTS public.sent_proximity_alerts_student_trip_kind_uidx;
CREATE UNIQUE INDEX sent_proximity_alerts_student_trip_kind_uidx
  ON public.sent_proximity_alerts (student_id, trip_id, alert_kind)
  WHERE trip_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- alerts_queue: campus_exit message type
-- ---------------------------------------------------------------------------
ALTER TABLE public.alerts_queue DROP CONSTRAINT IF EXISTS alerts_queue_message_type_check;
ALTER TABLE public.alerts_queue ADD CONSTRAINT alerts_queue_message_type_check
  CHECK (message_type IN (
    'proximity', 'boarding', 'dropoff', 'boarded', 'dropped_off',
    'trip_status', 'delay', 'campus_exit'
  ));

-- ---------------------------------------------------------------------------
-- Campus-exit ETA for every student on the trip (deduped per student/trip)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_campus_exit_parent_alerts(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  trip_rec RECORD;
  student_row RECORD;
  stop_row RECORD;
  sms_enabled BOOLEAN;
  template_exit TEXT;
  vehicle_plate TEXT;
  eta_secs INT;
  eta_mins INT;
  eta_time TIMESTAMPTZ;
  eta_str TEXT;
  sms_body TEXT;
  pred TIMESTAMPTZ;
  action_verb TEXT;
  already BOOLEAN;
BEGIN
  SELECT t.id, t.tenant_id, t.route_id, t.vehicle_id, t.schedule_id, sch.direction
  INTO trip_rec
  FROM public.trips t
  LEFT JOIN public.schedules sch ON sch.id = t.schedule_id
  WHERE t.id = p_trip_id;

  IF trip_rec.id IS NULL OR trip_rec.route_id IS NULL THEN
    RETURN;
  END IF;

  IF trip_rec.direction IS NULL THEN
    trip_rec.direction := 'HOME_TO_SCHOOL';
  END IF;

  action_verb := CASE WHEN trip_rec.direction = 'SCHOOL_TO_HOME' THEN 'dropped off' ELSE 'picked up' END;

  SELECT sms_notifications_enabled, sms_template_campus_exit
  INTO sms_enabled, template_exit
  FROM public.tenant_configs
  WHERE tenant_id = trip_rec.tenant_id;

  IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
  IF template_exit IS NULL OR template_exit = '' THEN
    template_exit := 'Hi {parent_name}, Bus {vehicle_plate} has left school. {student_name} will be {action} at {stop_name} around {eta_time} (about {duration_mins} min).';
  END IF;

  SELECT license_plate INTO vehicle_plate FROM public.vehicles WHERE id = trip_rec.vehicle_id;
  IF vehicle_plate IS NULL THEN vehicle_plate := 'assigned bus'; END IF;

  FOR student_row IN
    SELECT
      s.id AS student_id,
      s.name AS student_name,
      s.parent_id,
      p.name AS parent_name,
      CASE
        WHEN trip_rec.direction = 'SCHOOL_TO_HOME' THEN s.dropoff_stop_id
        ELSE s.pickup_stop_id
      END AS stop_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.parent_id
    WHERE s.route_id = trip_rec.route_id
      AND s.tenant_id = trip_rec.tenant_id
  LOOP
    IF student_row.stop_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.sent_proximity_alerts spa
      WHERE spa.student_id = student_row.student_id
        AND spa.trip_id = p_trip_id
        AND spa.alert_kind = 'campus_exit'
    ) INTO already;
    IF already THEN
      CONTINUE;
    END IF;

    SELECT id, name, sequence_no
    INTO stop_row
    FROM public.stops
    WHERE id = student_row.stop_id
    LIMIT 1;
    IF stop_row.id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT tse.predicted_arrival
    INTO pred
    FROM public.trip_stop_etas tse
    WHERE tse.trip_id = p_trip_id
      AND tse.stop_id = stop_row.id
    LIMIT 1;

    IF pred IS NOT NULL THEN
      eta_secs := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (pred - timezone('utc'::text, now()))))::INT);
    ELSE
      SELECT COALESCE(SUM(st.duration_from_prev_seconds), 0)::INT
      INTO eta_secs
      FROM public.stops st
      WHERE st.route_id = trip_rec.route_id
        AND st.sequence_no <= stop_row.sequence_no;
    END IF;

    eta_mins := ROUND(eta_secs / 60.0);
    IF eta_mins <= 0 THEN eta_mins := 5; END IF;
    eta_time := timezone('utc'::text, now()) + (eta_secs || ' seconds')::INTERVAL;
    eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');

    sms_body := template_exit;
    sms_body := replace(sms_body, '{parent_name}', COALESCE(student_row.parent_name, 'Parent'));
    sms_body := replace(sms_body, '{student_name}', COALESCE(student_row.student_name, 'your child'));
    sms_body := replace(sms_body, '{vehicle_plate}', vehicle_plate);
    sms_body := replace(sms_body, '{stop_name}', COALESCE(stop_row.name, 'your stop'));
    sms_body := replace(sms_body, '{eta_time}', eta_str);
    sms_body := replace(sms_body, '{duration_mins}', eta_mins::TEXT);
    sms_body := replace(sms_body, '{action}', action_verb);

    BEGIN
      INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date, trip_id, alert_kind)
      VALUES (trip_rec.tenant_id, student_row.student_id, CURRENT_DATE, p_trip_id, 'campus_exit');
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
    VALUES (trip_rec.tenant_id, student_row.parent_id, 'Bus left school', sms_body, 'eta');

    IF sms_enabled THEN
      INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
      VALUES (trip_rec.tenant_id, student_row.student_id, student_row.parent_id, 'campus_exit', sms_body);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_campus_exit_parent_alerts failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_campus_exit_parent_alerts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_campus_exit_parent_alerts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.emit_campus_exit_parent_alerts(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.emit_campus_exit_parent_alerts(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 500 m approach around each student's own pickup/drop-off stop
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_stage_approach_parent_alerts(
  p_trip_id uuid,
  p_bus_geom geometry
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  trip_rec RECORD;
  student_row RECORD;
  stop_row RECORD;
  sms_enabled BOOLEAN;
  notify_entry BOOLEAN;
  approach_radius INT;
  template_geo TEXT;
  mapbox_token TEXT;
  vehicle_plate TEXT;
  eta_secs INT;
  eta_mins INT;
  eta_time TIMESTAMPTZ;
  eta_str TEXT;
  sms_body TEXT;
  already BOOLEAN;
  bus_lng DOUBLE PRECISION;
  bus_lat DOUBLE PRECISION;
BEGIN
  SELECT t.id, t.tenant_id, t.route_id, t.vehicle_id, sch.direction
  INTO trip_rec
  FROM public.trips t
  LEFT JOIN public.schedules sch ON sch.id = t.schedule_id
  WHERE t.id = p_trip_id;

  IF trip_rec.id IS NULL OR trip_rec.route_id IS NULL THEN
    RETURN;
  END IF;

  IF trip_rec.direction IS NULL THEN
    trip_rec.direction := 'HOME_TO_SCHOOL';
  END IF;

  SELECT
    sms_notifications_enabled,
    notify_on_geofence_entry,
    geofence_radius_meters,
    sms_template_geofence,
    mapbox_access_token
  INTO
    sms_enabled,
    notify_entry,
    approach_radius,
    template_geo,
    mapbox_token
  FROM public.tenant_configs
  WHERE tenant_id = trip_rec.tenant_id;

  IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
  IF notify_entry IS NULL THEN notify_entry := TRUE; END IF;
  IF approach_radius IS NULL OR approach_radius <= 0 THEN approach_radius := 500; END IF;
  IF template_geo IS NULL OR template_geo = '' THEN
    template_geo := 'Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.';
  END IF;

  SELECT license_plate INTO vehicle_plate FROM public.vehicles WHERE id = trip_rec.vehicle_id;
  IF vehicle_plate IS NULL THEN vehicle_plate := 'assigned bus'; END IF;

  bus_lng := ST_X(p_bus_geom);
  bus_lat := ST_Y(p_bus_geom);

  FOR student_row IN
    SELECT
      s.id AS student_id,
      s.name AS student_name,
      s.parent_id,
      p.name AS parent_name,
      CASE
        WHEN trip_rec.direction = 'SCHOOL_TO_HOME' THEN s.dropoff_stop_id
        ELSE s.pickup_stop_id
      END AS stop_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.parent_id
    WHERE s.route_id = trip_rec.route_id
      AND s.tenant_id = trip_rec.tenant_id
  LOOP
    IF student_row.stop_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, name, location, sequence_no, duration_from_prev_seconds
    INTO stop_row
    FROM public.stops
    WHERE id = student_row.stop_id
    LIMIT 1;
    IF stop_row.id IS NULL OR stop_row.location IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT ST_DWithin(stop_row.location::geography, p_bus_geom::geography, approach_radius) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.sent_proximity_alerts spa
      WHERE spa.student_id = student_row.student_id
        AND spa.trip_id = p_trip_id
        AND spa.alert_kind = 'proximity'
    ) INTO already;
    IF already THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date, trip_id, alert_kind)
      VALUES (trip_rec.tenant_id, student_row.student_id, CURRENT_DATE, p_trip_id, 'proximity');
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    IF mapbox_token IS NOT NULL AND mapbox_token <> '' THEN
      INSERT INTO public.eta_calculation_queue (
        tenant_id, student_id, parent_id,
        bus_lng, bus_lat,
        stop_lng, stop_lat,
        stop_name, vehicle_plate, student_name, parent_name
      ) VALUES (
        trip_rec.tenant_id,
        student_row.student_id,
        student_row.parent_id,
        bus_lng,
        bus_lat,
        ST_X(stop_row.location::geometry),
        ST_Y(stop_row.location::geometry),
        stop_row.name,
        vehicle_plate,
        student_row.student_name,
        student_row.parent_name
      );
    ELSE
      eta_secs := COALESCE(stop_row.duration_from_prev_seconds, 0);
      eta_mins := ROUND(eta_secs / 60.0);
      IF eta_mins <= 0 THEN eta_mins := 5; END IF;
      eta_time := timezone('utc'::text, now()) + (eta_secs || ' seconds')::INTERVAL;
      eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');

      sms_body := template_geo;
      sms_body := replace(sms_body, '{parent_name}', COALESCE(student_row.parent_name, 'Parent'));
      sms_body := replace(sms_body, '{student_name}', COALESCE(student_row.student_name, 'your child'));
      sms_body := replace(sms_body, '{vehicle_plate}', vehicle_plate);
      sms_body := replace(sms_body, '{stop_name}', COALESCE(stop_row.name, 'your stop'));
      sms_body := replace(sms_body, '{duration_mins}', eta_mins::TEXT);
      sms_body := replace(sms_body, '{eta_time}', eta_str);

      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (trip_rec.tenant_id, student_row.parent_id, 'Bus Approaching Stop', sms_body, 'eta');

      IF sms_enabled AND notify_entry THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (trip_rec.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', sms_body);
      END IF;
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_stage_approach_parent_alerts failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_stage_approach_parent_alerts(uuid, geometry) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_stage_approach_parent_alerts(uuid, geometry) FROM anon;
REVOKE ALL ON FUNCTION public.emit_stage_approach_parent_alerts(uuid, geometry) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.emit_stage_approach_parent_alerts(uuid, geometry) TO service_role;

-- ---------------------------------------------------------------------------
-- Telemetry trigger: campus exit + 500 m student-stop approach; keep 50 m arrival log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  trip_rec RECORD;
  stop_row RECORD;
  campus_loc GEOMETRY;
  stop_arrived_today BOOLEAN;
BEGIN
  SELECT t.id, t.tenant_id, t.route_id, t.campus_id
  INTO trip_rec
  FROM public.trips t
  WHERE t.vehicle_id = NEW.vehicle_id
    AND t.route_id = NEW.route_id
    AND t.trip_date = CURRENT_DATE
    AND t.status = 'in_progress'
  ORDER BY t.started_at DESC NULLS LAST
  LIMIT 1;

  IF trip_rec.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF trip_rec.campus_id IS NOT NULL THEN
    SELECT location INTO campus_loc
    FROM public.campuses
    WHERE id = trip_rec.campus_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF campus_loc IS NULL THEN
    SELECT location INTO campus_loc
    FROM public.campuses
    WHERE tenant_id = NEW.tenant_id
      AND deleted_at IS NULL
      AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF campus_loc IS NULL OR NOT ST_DWithin(campus_loc::geography, NEW.coordinates::geography, 150) THEN
    PERFORM public.emit_campus_exit_parent_alerts(trip_rec.id);
  END IF;

  PERFORM public.emit_stage_approach_parent_alerts(trip_rec.id, NEW.coordinates);

  FOR stop_row IN
    SELECT id, location, geofence_radius_meters
    FROM public.stops
    WHERE route_id = NEW.route_id
    ORDER BY sequence_no ASC
  LOOP
    IF ST_DWithin(stop_row.location::geography, NEW.coordinates::geography, COALESCE(stop_row.geofence_radius_meters, 50)) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.stop_arrivals_log
        WHERE stop_id = stop_row.id
          AND trip_date = CURRENT_DATE
      ) INTO stop_arrived_today;

      IF NOT stop_arrived_today THEN
        INSERT INTO public.stop_arrivals_log (tenant_id, route_id, stop_id, trip_date)
        VALUES (NEW.tenant_id, NEW.route_id, stop_row.id, CURRENT_DATE)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'check_geofence_triggers failed (telemetry insert preserved): %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM anon;
REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_geofence_triggers() TO service_role;

-- ---------------------------------------------------------------------------
-- Trip start: no generic parent trip-start SMS. Campus-exit fallback if already
-- outside campus (or no campus pin). Delay/status_override parent messages stay.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_trip_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  campus_loc GEOMETRY;
  bus_geom GEOMETRY;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.status_override IS DISTINCT FROM NEW.status_override) THEN
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

    IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
    IF template_start IS NULL THEN
      template_start := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.';
    END IF;
    IF template_status IS NULL THEN
      template_status := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.';
    END IF;

    SELECT name INTO route_name FROM public.routes WHERE id = NEW.route_id;
    SELECT name INTO trip_name FROM public.schedules WHERE id = NEW.schedule_id;
    status_label := COALESCE(NEW.status_override, NEW.status::text);

    IF NEW.vehicle_id IS NOT NULL THEN
      SELECT license_plate INTO vehicle_plate FROM public.vehicles WHERE id = NEW.vehicle_id;
    END IF;
    IF vehicle_plate IS NULL THEN vehicle_plate := 'assigned bus'; END IF;

    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      IF NEW.campus_id IS NOT NULL THEN
        SELECT location INTO campus_loc FROM public.campuses WHERE id = NEW.campus_id AND deleted_at IS NULL LIMIT 1;
      END IF;
      IF campus_loc IS NULL THEN
        SELECT location INTO campus_loc
        FROM public.campuses
        WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      IF NEW.vehicle_id IS NOT NULL THEN
        SELECT coordinates INTO bus_geom
        FROM public.live_coordinates
        WHERE vehicle_id = NEW.vehicle_id
        ORDER BY created_at DESC
        LIMIT 1;
      END IF;

      IF campus_loc IS NULL THEN
        PERFORM public.emit_campus_exit_parent_alerts(NEW.id);
      ELSIF bus_geom IS NOT NULL AND NOT ST_DWithin(campus_loc::geography, bus_geom::geography, 150) THEN
        PERFORM public.emit_campus_exit_parent_alerts(NEW.id);
      END IF;
    ELSE
      base_msg := replace(template_status, '{route_name}', route_name);
      base_msg := replace(base_msg, '{status_label}', status_label);
      IF NEW.custom_departure_time IS NOT NULL THEN
        base_msg := replace(base_msg, '{departure_time}', NEW.custom_departure_time);
      ELSE
        base_msg := replace(base_msg, ' New departure time: {departure_time}.', '');
        base_msg := replace(base_msg, ' New departure: {departure_time}.', '');
        base_msg := replace(base_msg, ' ({departure_time})', '');
        base_msg := replace(base_msg, ' {departure_time}', '');
      END IF;
      base_msg := replace(base_msg, '{trip_name}', COALESCE(trip_name, route_name));
      base_msg := replace(base_msg, '{trip_description}', COALESCE(NEW.description, 'no specified reason'));
      base_msg := replace(base_msg, '{status_override}', COALESCE(NEW.status_override, NEW.status::text));

      IF NEW.description IS NOT NULL AND NEW.description <> ''
         AND position('{trip_description}' in template_status) = 0 THEN
        base_msg := base_msg || ' Note: ' || NEW.description;
      END IF;

      FOR student_row IN
        SELECT s.id as student_id, s.name as student_name, s.parent_id, p.name as parent_name
        FROM public.students s
        JOIN public.profiles p ON s.parent_id = p.id
        WHERE s.route_id = NEW.route_id
      LOOP
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
    END IF;

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
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.on_trip_status_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.on_trip_status_update() TO service_role;
