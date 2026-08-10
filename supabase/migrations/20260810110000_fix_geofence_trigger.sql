-- Repair check_geofence_triggers: the 20260714120000 rewrite referenced columns that do
-- not exist on live_coordinates (NEW.geom, NEW.trip_id) and vehicles (plate_no), which
-- made every telemetry insert fail. This re-declares the function with:
--   * NEW.coordinates (the real geometry column)
--   * active trip resolved by vehicle_id + route_id + trip_date + status = 'in_progress'
--   * vehicles.license_plate (the real column)
--   * an exception guard so auxiliary alerting can never abort GPS ingestion
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  trip_rec RECORD;
  stop_row RECORD;
  next_stop_row RECORD;
  student_row RECORD;
  stop_arrived_today BOOLEAN;
  alert_exists BOOLEAN;
  direction_val public.transit_direction;
  vehicle_plate TEXT;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  sms_body TEXT;
  sms_enabled BOOLEAN;
  mapbox_token TEXT;
  bus_lng DOUBLE PRECISION;
  bus_lat DOUBLE PRECISION;
  stop_lng DOUBLE PRECISION;
  stop_lat DOUBLE PRECISION;
BEGIN
  -- Resolve active trip context (direction) from the vehicle's in-progress trip today
  SELECT t.id, t.schedule_id
  INTO trip_rec
  FROM public.trips t
  WHERE t.vehicle_id = NEW.vehicle_id
    AND t.route_id = NEW.route_id
    AND t.trip_date = CURRENT_DATE
    AND t.status = 'in_progress'
  ORDER BY t.started_at DESC NULLS LAST
  LIMIT 1;

  IF trip_rec.id IS NOT NULL THEN
    SELECT direction INTO direction_val
    FROM public.schedules
    WHERE id = trip_rec.schedule_id;
  END IF;

  IF direction_val IS NULL THEN
    direction_val := 'HOME_TO_SCHOOL';
  END IF;

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

  SELECT license_plate INTO vehicle_plate
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF vehicle_plate IS NULL THEN
    vehicle_plate := 'assigned bus';
  END IF;

  -- 1. Loop through all stops for the route
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
        SELECT id, name, location, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = NEW.route_id
          AND sequence_no = stop_row.sequence_no + 1
        LIMIT 1
        INTO next_stop_row;

        -- If next stop exists, queue warning alerts for parents
        IF next_stop_row.id IS NOT NULL THEN

          -- Extract coordinates for calculations
          bus_lng := ST_X(NEW.coordinates::geometry);
          bus_lat := ST_Y(NEW.coordinates::geometry);
          stop_lng := ST_X(next_stop_row.location::geometry);
          stop_lat := ST_Y(next_stop_row.location::geometry);

          -- Fetch students assigned to Stop N+1 (pickup or dropoff depending on route direction)
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
                -- Async Mode: Queue the row for Matrix API lookup
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
                  vehicle_plate,
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
EXCEPTION WHEN OTHERS THEN
  -- Invariant: auxiliary alerting must never abort telemetry ingestion
  RAISE WARNING 'check_geofence_triggers failed (telemetry insert preserved): %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM anon;
REVOKE ALL ON FUNCTION public.check_geofence_triggers() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_geofence_triggers() TO service_role;
