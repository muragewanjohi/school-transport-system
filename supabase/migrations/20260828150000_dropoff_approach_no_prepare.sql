-- Drop-off stage approach must not use the pickup "Please prepare {student}" copy.

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

  IF trip_rec.direction = 'SCHOOL_TO_HOME' THEN
    template_geo := 'Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. {student_name} will be dropped off shortly.';
  ELSIF template_geo IS NULL OR template_geo = '' THEN
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
