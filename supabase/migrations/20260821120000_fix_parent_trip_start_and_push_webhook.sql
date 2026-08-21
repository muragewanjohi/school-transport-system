-- Immediate parent trip-start notifications + fix push/SMS webhooks to use net.http_post.
-- Root cause for missing lock-screen push: trigger_push_webhook called extensions.net_http_post
-- which does not exist (pg_net exposes net.http_post). Same bug on trigger_alert_webhook.

-- ---------------------------------------------------------------------------
-- Fix push webhook (lock-screen FCM when app is closed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_push_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'net'
AS $$
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
    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_milliseconds := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger notifications push webhook: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_push_webhook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_push_webhook() TO service_role;

-- ---------------------------------------------------------------------------
-- Fix SMS alert webhook (same broken extensions.net_http_post call)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_alert_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'net'
AS $$
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
    webhook_url := 'http://kong:8000/functions/v1/send-sms';
  ELSE
    IF request_host NOT LIKE 'http%' THEN
      webhook_url := 'https://' || request_host || '/functions/v1/send-sms';
    ELSE
      webhook_url := request_host || '/functions/v1/send-sms';
    END IF;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_milliseconds := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger alerts_queue SMS webhook: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_alert_webhook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_alert_webhook() TO service_role;

-- ---------------------------------------------------------------------------
-- Allow trip_start on alerts_queue (SMS optional channel for trip start)
-- ---------------------------------------------------------------------------
ALTER TABLE public.alerts_queue DROP CONSTRAINT IF EXISTS alerts_queue_message_type_check;
ALTER TABLE public.alerts_queue ADD CONSTRAINT alerts_queue_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'proximity'::text, 'boarding'::text, 'dropoff'::text, 'boarded'::text,
    'dropped_off'::text, 'trip_status'::text, 'delay'::text, 'campus_exit'::text,
    'absent'::text, 'trip_start'::text
  ]));

-- ---------------------------------------------------------------------------
-- Parents may delete their own inbox rows (Clear All fallback)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Trip start: immediate parent trip_start notifications (notify_on_trip_start)
-- Campus-exit fallback when already outside campus stays unchanged.
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
  notify_start BOOLEAN;
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
      COALESCE(notify_on_trip_start, TRUE),
      sms_template_trip_start,
      sms_template_trip_status
    INTO
      sms_enabled,
      notify_start,
      template_start,
      template_status
    FROM public.tenant_configs
    WHERE tenant_id = NEW.tenant_id;

    IF sms_enabled IS NULL THEN sms_enabled := FALSE; END IF;
    IF notify_start IS NULL THEN notify_start := TRUE; END IF;
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
      -- Immediate trip-start notify (does not wait for campus-exit GPS)
      IF notify_start IS TRUE THEN
        base_msg := replace(template_start, '{route_name}', COALESCE(route_name, 'your route'));
        base_msg := replace(base_msg, '{trip_name}', COALESCE(trip_name, route_name, 'today''s trip'));
        base_msg := replace(base_msg, '{vehicle_plate}', vehicle_plate);

        FOR student_row IN
          SELECT s.id as student_id, s.name as student_name, s.parent_id, p.name as parent_name
          FROM public.students s
          JOIN public.profiles p ON s.parent_id = p.id
          WHERE s.route_id = NEW.route_id
            AND s.tenant_id = NEW.tenant_id
            AND s.parent_id IS NOT NULL
        LOOP
          custom_msg := replace(base_msg, '{parent_name}', COALESCE(student_row.parent_name, 'Parent'));
          custom_msg := replace(custom_msg, '{student_name}', COALESCE(student_row.student_name, 'your child'));
          custom_msg := replace(custom_msg, '{vehicle_plate}', vehicle_plate);

          INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
          VALUES (NEW.tenant_id, student_row.parent_id, 'Trip started', custom_msg, 'trip_start');

          IF sms_enabled THEN
            INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
            VALUES (NEW.tenant_id, student_row.student_id, student_row.parent_id, 'trip_start', custom_msg);
          END IF;
        END LOOP;
      END IF;

      -- Campus-exit if already outside (or no campus pin)
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
