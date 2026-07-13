-- Add new SMS templates to tenant_configs with support for parent_name, student_name, route_name, vehicle_plate, trip_name, trip_description, and status_override
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_template_trip_start TEXT DEFAULT 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.' NOT NULL;
ALTER TABLE public.tenant_configs ADD COLUMN IF NOT EXISTS sms_template_trip_status TEXT DEFAULT 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.' NOT NULL;

-- Re-declare trigger function on public.trips to support customizable templates and parent/student/vehicle/override tokens
CREATE OR REPLACE FUNCTION public.on_trip_status_update()
RETURNS TRIGGER AS $$
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
  next_stop_row RECORD;
  direction_val public.transit_direction;
  eta_time TIMESTAMP WITH TIME ZONE;
  eta_str TEXT;
  eta_mins INT;
  eta_msg TEXT;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.status_override IS DISTINCT FROM NEW.status_override) THEN
    -- Check configuration and templates
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
    
    IF sms_enabled IS NULL THEN
      sms_enabled := FALSE;
    END IF;

    IF template_start IS NULL THEN
      template_start := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.';
    END IF;

    IF template_status IS NULL THEN
      template_status := 'Hi {parent_name}, Bus Schedule Alert: Today''s trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.';
    END IF;

    -- Get route and trip name (schedule name)
    SELECT name INTO route_name FROM public.routes WHERE id = NEW.route_id;
    SELECT name INTO trip_name FROM public.schedules WHERE id = NEW.schedule_id;
    status_label := COALESCE(NEW.status_override, NEW.status::text);
    
    -- Get vehicle plate
    IF NEW.vehicle_id IS NOT NULL THEN
      SELECT plate_no INTO vehicle_plate FROM public.vehicles WHERE id = NEW.vehicle_id;
    END IF;
    IF vehicle_plate IS NULL THEN
      vehicle_plate := 'assigned bus';
    END IF;
    
    -- Format base message using route/status templates
    IF NEW.status = 'in_progress' AND OLD.status = 'scheduled' THEN
      base_msg := replace(template_start, '{route_name}', route_name);
    ELSE
      base_msg := replace(template_status, '{route_name}', route_name);
      base_msg := replace(base_msg, '{status_label}', status_label);
      IF NEW.custom_departure_time IS NOT NULL THEN
        base_msg := replace(base_msg, '{departure_time}', NEW.custom_departure_time);
      ELSE
        -- Clean up departure time token if not provided
        base_msg := replace(base_msg, ' New departure time: {departure_time}.', '');
        base_msg := replace(base_msg, ' New departure: {departure_time}.', '');
        base_msg := replace(base_msg, ' ({departure_time})', '');
        base_msg := replace(base_msg, ' {departure_time}', '');
      END IF;
    END IF;

    -- Replace global trip tokens at base message level
    base_msg := replace(base_msg, '{trip_name}', COALESCE(trip_name, route_name));
    base_msg := replace(base_msg, '{trip_description}', COALESCE(NEW.description, 'no specified reason'));
    base_msg := replace(base_msg, '{status_override}', COALESCE(NEW.status_override, NEW.status::text));

    -- Only append description dynamically if it wasn't already placeholder-replaced in the template
    IF NEW.description IS NOT NULL AND NEW.description <> '' 
       AND position('{trip_description}' in template_status) = 0 
       AND position('{trip_description}' in template_start) = 0 THEN
      base_msg := base_msg || ' Note: ' || NEW.description;
    END IF;

    -- 1. Notify parents of all students on this route
    FOR student_row IN 
      SELECT 
        s.id as student_id, 
        s.name as student_name, 
        s.parent_id,
        p.name as parent_name
      FROM public.students s
      JOIN public.profiles p ON s.parent_id = p.id
      WHERE s.route_id = NEW.route_id
    LOOP
      -- Perform parent-student specific replacements on a copy
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

    -- 2. Notify Driver and Conductor (In-App + SMS if enabled)
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
          eta_msg := 'Hi ' || COALESCE(student_row.parent_name, 'Parent') || ', Bus Schedule: Bus ' || vehicle_plate || 
                     ' has started the trip and is heading to ' || next_stop_row.name || 
                     ' for ' || COALESCE(student_row.student_name, 'your child') || 
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
