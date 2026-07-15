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
