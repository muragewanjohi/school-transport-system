-- Add SMS toggle to configuration
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT FALSE NOT NULL;

-- Allow alerts_queue to support driver/conductor SMS logs (by making student_id nullable)
ALTER TABLE public.alerts_queue ALTER COLUMN student_id DROP NOT NULL;

-- Create notifications table for in-app alerts
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'trip_status', 'trip_start', 'eta', 'student_event'
    read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create user_fcm_tokens table for device push tokens
CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL,
    device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_device_token UNIQUE (user_id, token)
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "School Admins can view tenant notifications" ON public.notifications
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- Create policies for user_fcm_tokens
CREATE POLICY "Users can manage own FCM tokens" ON public.user_fcm_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- DB Trigger: Notify on Trip Status Update (and Trip Start)
CREATE OR REPLACE FUNCTION public.on_trip_status_update()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  sms_enabled BOOLEAN;
  custom_msg TEXT;
  status_label TEXT;
  route_name TEXT;
  next_stop_row RECORD;
  direction_val public.transit_direction;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  eta_msg TEXT;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.status_override IS DISTINCT FROM NEW.status_override) THEN
    -- Check configuration
    SELECT sms_notifications_enabled INTO sms_enabled
    FROM public.tenant_configs
    WHERE tenant_id = NEW.tenant_id;
    
    IF sms_enabled IS NULL THEN
      sms_enabled := FALSE;
    END IF;

    -- Get route name
    SELECT name INTO route_name FROM public.routes WHERE id = NEW.route_id;
    status_label := COALESCE(NEW.status_override, NEW.status::text);
    
    -- Format message
    IF status_label ILIKE '%delay%' AND NEW.custom_departure_time IS NOT NULL THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' is delayed. New departure time: ' || NEW.custom_departure_time || '.';
    ELSIF status_label = 'cancelled' THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' has been cancelled.';
    ELSIF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' has started. Bus is active on route.';
    ELSE
      custom_msg := 'Safaricom Track Alert: Today''s trip on route ' || route_name || ' status is now ' || status_label || '.';
    END IF;

    IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
      custom_msg := custom_msg || ' Note: ' || NEW.description;
    END IF;

    -- 1. Notify parents of all students on this route
    FOR student_row IN 
      SELECT s.id as student_id, s.parent_id
      FROM public.students s
      WHERE s.route_id = NEW.route_id AND s.parent_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, student_row.parent_id, 'Trip Update', custom_msg, 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', custom_msg);
      END IF;
    END LOOP;

    -- 2. Notify Driver and Conductor (In-App + SMS if enabled)
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.driver_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.driver_id, 'trip_status', 'Safaricom Track: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;
    
    IF NEW.conductor_1_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, NEW.conductor_1_id, 'Trip Status Change', 'Trip status updated to ' || status_label || '.', 'trip_status');
      
      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.conductor_1_id, 'trip_status', 'Safaricom Track: Your assigned trip status is now ' || status_label || '.');
      END IF;
    END IF;

    -- 3. Notify first stop ETA when trip starts
    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      SELECT direction INTO direction_val FROM public.schedules WHERE id = NEW.schedule_id;
      
      IF direction_val = 'HOME_TO_SCHOOL' THEN
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      ELSE -- SCHOOL_TO_HOME
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops WHERE route_id = NEW.route_id AND sequence_no > 1 ORDER BY sequence_no ASC LIMIT 1 INTO next_stop_row;
      END IF;

      IF next_stop_row.id IS NOT NULL THEN
        eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
        eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
        eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
        IF eta_mins <= 0 THEN eta_mins := 5; END IF;

        FOR student_row IN
          SELECT s.id as student_id, s.parent_id, s.name as student_name
          FROM public.students s
          WHERE s.route_id = NEW.route_id AND s.parent_id IS NOT NULL
            AND (
              (direction_val = 'HOME_TO_SCHOOL' AND s.pickup_stop_id = next_stop_row.id) OR
              (direction_val = 'SCHOOL_TO_HOME' AND s.dropoff_stop_id = next_stop_row.id)
            )
        LOOP
          eta_msg := 'Safaricom Track: Bus has started the trip and is heading to ' || next_stop_row.name || 
                     '. Estimated ETA is ' || eta_str || ' (approx. ' || eta_mins || ' mins away).';
          
          INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
          VALUES (NEW.tenant_id, student_row.parent_id, 'Bus Approaching Stop', eta_msg, 'eta');

          IF sms_enabled THEN
            INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
            VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', eta_msg);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_trip_status_updated
  AFTER UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.on_trip_status_update();

-- DB Trigger: Notify on Student Attendance Manifest Updates (Boarded / Dropped off)
CREATE OR REPLACE FUNCTION public.on_manifest_attendance_update()
RETURNS TRIGGER AS $$
DECLARE
  student_row RECORD;
  sms_enabled BOOLEAN;
  msg TEXT;
  now_time TEXT;
  vehicle_plate TEXT;
BEGIN
  IF (OLD.attendance IS DISTINCT FROM NEW.attendance) AND (NEW.attendance IN ('boarded', 'dropped_off')) THEN
    SELECT sms_notifications_enabled INTO sms_enabled FROM public.tenant_configs WHERE tenant_id = NEW.tenant_id;
    IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
    
    SELECT s.name as student_name, s.parent_id, v.license_plate
    FROM public.students s
    JOIN public.trips t ON t.id = NEW.trip_id
    LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
    WHERE s.id = NEW.student_id
    INTO student_row;
    
    IF student_row.parent_id IS NOT NULL THEN
      now_time := to_char(timezone('Africa/Nairobi', now()), 'HH:MI AM');
      vehicle_plate := COALESCE(student_row.license_plate, 'assigned bus');
      
      IF NEW.attendance = 'boarded' THEN
        msg := 'Bus Schedule: ' || student_row.student_name || ' has safely boarded the school bus ' || vehicle_plate || ' at ' || now_time || '.';
      ELSE
        msg := 'Bus Schedule: ' || student_row.student_name || ' has been dropped off safely at ' || now_time || '.';
      END IF;

      INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
      VALUES (NEW.tenant_id, student_row.parent_id, 'Student Status Alert', msg, 'student_event');

      IF sms_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.student_id, student_row.parent_id, NEW.attendance::text, msg);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_manifest_attendance_updated
  AFTER UPDATE ON public.trip_manifests
  FOR EACH ROW EXECUTE FUNCTION public.on_manifest_attendance_update();

-- Re-declare check_geofence_triggers to support SMS config & route direction checks & app notifications
CREATE OR REPLACE FUNCTION public.check_geofence_triggers()
RETURNS TRIGGER AS $$
DECLARE
  stop_row RECORD;
  next_stop_row RECORD;
  student_row RECORD;
  stop_arrived_today BOOLEAN;
  alert_exists BOOLEAN;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  sms_body TEXT;
  sms_enabled BOOLEAN;
  active_schedule_id UUID;
  direction_val public.transit_direction;
BEGIN
  -- Get SMS configuration
  SELECT sms_notifications_enabled INTO sms_enabled
  FROM public.tenant_configs
  WHERE tenant_id = NEW.tenant_id;
  
  IF sms_enabled IS NULL THEN
    sms_enabled := FALSE;
  END IF;
  
  -- Try to find active schedule and direction for the vehicle
  SELECT schedule_id INTO active_schedule_id
  FROM public.trips
  WHERE vehicle_id = NEW.vehicle_id
    AND trip_date = CURRENT_DATE
    AND status = 'in_progress'
  LIMIT 1;
  
  IF active_schedule_id IS NOT NULL THEN
    SELECT direction INTO direction_val
    FROM public.schedules
    WHERE id = active_schedule_id;
  END IF;
  
  -- Default direction if none active
  IF direction_val IS NULL THEN
    direction_val := 'HOME_TO_SCHOOL';
  END IF;

  -- Iterate through stops on this route ordered by sequence to determine exact order
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
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = NEW.route_id
          AND sequence_no = stop_row.sequence_no + 1
        LIMIT 1
        INTO next_stop_row;

        -- If next stop exists, queue warning alerts for parents
        IF next_stop_row.id IS NOT NULL THEN
          
          -- Calculate dynamic ETA adding leg duration (adjusted for local East Africa Time timezone)
          eta_time := (timezone('utc'::text, now()) + (next_stop_row.duration_from_prev_seconds || ' seconds')::INTERVAL);
          eta_str := to_char(eta_time AT TIME ZONE 'Africa/Nairobi', 'HH:MI AM');
          eta_mins := ROUND(next_stop_row.duration_from_prev_seconds / 60.0);
          
          IF eta_mins <= 0 THEN
            eta_mins := 5; -- default safety estimate
          END IF;

          -- Fetch students assigned to Stop N+1 (pickup or dropoff depending on route direction)
          FOR student_row IN
            SELECT s.id as student_id, s.name as student_name, s.parent_id
            FROM public.students s
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
              INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
              VALUES (NEW.tenant_id, student_row.student_id, CURRENT_DATE)
              ON CONFLICT (student_id, trip_date) DO NOTHING;

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
            
          END LOOP;
        END IF;
      END IF;
      
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DB Trigger: Send Webhook to Firebase Push Notification Edge Function on Insert
CREATE OR REPLACE FUNCTION public.trigger_push_webhook()
RETURNS TRIGGER AS $$
DECLARE
  request_host TEXT;
  webhook_url TEXT;
BEGIN
  BEGIN
    request_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION
    WHEN OTHERS THEN
      request_host := NULL;
  END;

  IF request_host IS NULL OR request_host = '' THEN
    request_host := 'nxhccqbvjrxqqfvpfcmx.supabase.co';
  END IF;

  IF request_host LIKE 'localhost%' OR request_host LIKE '127.0.0.1%' OR request_host LIKE '54321%' THEN
    webhook_url := 'http://kong:8000/functions/v1/send-push';
  ELSE
    IF request_host NOT LIKE 'http%' THEN
      webhook_url := 'https://' || request_host || '/functions/v1/send-push';
    ELSE
      webhook_url := request_host || '/functions/v1/send-push';
    END IF;
  END IF;

  BEGIN
    PERFORM extensions.net_http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('private.keys.service_role', true), '')
      ),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_ms := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger notifications push webhook: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_notification_queued
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_webhook();
