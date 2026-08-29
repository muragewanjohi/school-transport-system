-- Trip status updates notify only students on that trip schedule, not the whole corridor route.
-- Completed trips do not fan out parent/driver status alerts.

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
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

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
      IF notify_start IS TRUE THEN
        base_msg := replace(template_start, '{route_name}', COALESCE(route_name, 'your route'));
        base_msg := replace(base_msg, '{trip_name}', COALESCE(trip_name, route_name, 'today''s trip'));
        base_msg := replace(base_msg, '{vehicle_plate}', vehicle_plate);

        FOR student_row IN
          SELECT s.id as student_id, s.name as student_name, s.parent_id, p.name as parent_name
          FROM public.students s
          JOIN public.profiles p ON s.parent_id = p.id
          WHERE s.tenant_id = NEW.tenant_id
            AND s.parent_id IS NOT NULL
            AND (
              CASE
                WHEN NEW.schedule_id IS NOT NULL THEN NEW.schedule_id = ANY (COALESCE(s.schedule_ids, '{}'::uuid[]))
                ELSE s.route_id = NEW.route_id
              END
            )
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
        WHERE s.tenant_id = NEW.tenant_id
          AND s.parent_id IS NOT NULL
          AND (
            CASE
              WHEN NEW.schedule_id IS NOT NULL THEN NEW.schedule_id = ANY (COALESCE(s.schedule_ids, '{}'::uuid[]))
              ELSE s.route_id = NEW.route_id
            END
          )
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
