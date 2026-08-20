-- Parent absent notifications: school-configurable stop + drop-off campus templates.
-- Stop copy: Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS notify_on_absent_stop BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_on_absent_campus BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_template_absent_stop TEXT NOT NULL DEFAULT
    'Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.',
  ADD COLUMN IF NOT EXISTS sms_template_absent_campus TEXT NOT NULL DEFAULT
    'Bus {vehicle_plate}: {student_name} was marked absent before the trip left school at {time}.';

ALTER TABLE public.alerts_queue DROP CONSTRAINT IF EXISTS alerts_queue_message_type_check;
ALTER TABLE public.alerts_queue ADD CONSTRAINT alerts_queue_message_type_check
  CHECK (message_type IN (
    'proximity', 'boarding', 'dropoff', 'boarded', 'dropped_off',
    'trip_status', 'delay', 'campus_exit', 'absent'
  ));

CREATE OR REPLACE FUNCTION public.on_manifest_attendance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  student_row RECORD;
  trip_row RECORD;
  cfg RECORD;
  msg TEXT;
  now_time TEXT;
  vehicle_plate TEXT;
  stop_name TEXT;
  stop_id UUID;
  template TEXT;
  notify_enabled BOOLEAN;
  kind TEXT;
BEGIN
  IF OLD.attendance IS NOT DISTINCT FROM NEW.attendance THEN
    RETURN NEW;
  END IF;

  IF NEW.attendance IN ('boarded', 'dropped_off') THEN
    SELECT sms_notifications_enabled INTO notify_enabled
    FROM public.tenant_configs
    WHERE tenant_id = NEW.tenant_id;
    IF notify_enabled IS NULL THEN notify_enabled := FALSE; END IF;

    SELECT s.name AS student_name, s.parent_id, v.license_plate
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

      IF notify_enabled THEN
        INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
        VALUES (NEW.tenant_id, NEW.student_id, student_row.parent_id, NEW.attendance::text, msg);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.attendance IS DISTINCT FROM 'absent' THEN
    RETURN NEW;
  END IF;

  SELECT
    t.status,
    COALESCE(sch.direction::text, 'HOME_TO_SCHOOL') AS direction,
    COALESCE(v.license_plate, 'assigned bus') AS license_plate
  INTO trip_row
  FROM public.trips t
  LEFT JOIN public.schedules sch ON sch.id = t.schedule_id
  LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
  WHERE t.id = NEW.trip_id;

  IF trip_row.status = 'in_progress' THEN
    kind := 'stop';
  ELSIF trip_row.status = 'scheduled' AND trip_row.direction = 'SCHOOL_TO_HOME' THEN
    kind := 'campus';
  ELSE
    RETURN NEW;
  END IF;

  SELECT
    sms_notifications_enabled,
    notify_on_absent_stop,
    notify_on_absent_campus,
    sms_template_absent_stop,
    sms_template_absent_campus
  INTO cfg
  FROM public.tenant_configs
  WHERE tenant_id = NEW.tenant_id;

  IF kind = 'stop' THEN
    notify_enabled := COALESCE(cfg.notify_on_absent_stop, TRUE);
    template := cfg.sms_template_absent_stop;
  ELSE
    notify_enabled := COALESCE(cfg.notify_on_absent_campus, TRUE);
    template := cfg.sms_template_absent_campus;
  END IF;

  IF notify_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT
    s.name AS student_name,
    s.parent_id,
    COALESCE(p.name, '') AS parent_name,
    s.pickup_stop_id,
    s.dropoff_stop_id
  INTO student_row
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = s.parent_id
  WHERE s.id = NEW.student_id;

  IF student_row.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  now_time := to_char(timezone('Africa/Nairobi', now()), 'HH:MI AM');
  vehicle_plate := COALESCE(trip_row.license_plate, 'assigned bus');

  IF trip_row.direction = 'SCHOOL_TO_HOME' THEN
    stop_id := student_row.dropoff_stop_id;
  ELSE
    stop_id := student_row.pickup_stop_id;
  END IF;

  SELECT name INTO stop_name FROM public.stops WHERE id = stop_id;
  stop_name := COALESCE(stop_name, 'the stage');

  IF template IS NULL OR btrim(template) = '' THEN
    IF kind = 'campus' THEN
      template := 'Bus {vehicle_plate}: {student_name} was marked absent before the trip left school at {time}.';
    ELSE
      template := 'Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.';
    END IF;
  END IF;

  msg := template;
  msg := replace(msg, '{parent_name}', COALESCE(student_row.parent_name, ''));
  msg := replace(msg, '{student_name}', COALESCE(student_row.student_name, ''));
  msg := replace(msg, '{vehicle_plate}', vehicle_plate);
  msg := replace(msg, '{bus_number_plate}', vehicle_plate);
  msg := replace(msg, '{stop_name}', stop_name);
  msg := replace(msg, '{stage_name}', stop_name);
  msg := replace(msg, '{time}', now_time);

  INSERT INTO public.notifications (tenant_id, user_id, title, message, notification_type)
  VALUES (NEW.tenant_id, student_row.parent_id, 'Student Status Alert', msg, 'student_event');

  IF COALESCE(cfg.sms_notifications_enabled, FALSE) IS TRUE THEN
    INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
    VALUES (NEW.tenant_id, NEW.student_id, student_row.parent_id, 'absent', msg);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.on_manifest_attendance_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.on_manifest_attendance_update() FROM anon;
REVOKE ALL ON FUNCTION public.on_manifest_attendance_update() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.on_manifest_attendance_update() TO service_role;
