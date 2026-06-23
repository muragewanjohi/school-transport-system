-- 1. Extend public.stops table with distance and duration attributes
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS distance_from_prev_meters NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS duration_from_prev_seconds NUMERIC DEFAULT 0 NOT NULL;

-- 2. Extend public.alerts_queue table with custom message attribute
ALTER TABLE public.alerts_queue ADD COLUMN IF NOT EXISTS custom_message TEXT;

-- 3. Create public.stop_arrivals_log table to prevent repeat triggers for the same stop on a daily run
CREATE TABLE IF NOT EXISTS public.stop_arrivals_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE NOT NULL,
    stop_id UUID REFERENCES public.stops(id) ON DELETE CASCADE NOT NULL,
    trip_date DATE DEFAULT CURRENT_DATE NOT NULL,
    arrived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_stop_arrival_per_day UNIQUE (route_id, stop_id, trip_date)
);

-- Enable RLS on stop_arrivals_log
ALTER TABLE public.stop_arrivals_log ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for stop_arrivals_log
CREATE POLICY "School Admins can manage stop arrivals log" ON public.stop_arrivals_log
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');
CREATE POLICY "Drivers can view stop arrivals log" ON public.stop_arrivals_log
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');

-- 4. Re-declare check_geofence_triggers to run dynamic stops sequence checks & next-stop ETA calculations
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
BEGIN
  -- Iterate through stops on this route ordered by sequence to determine exact order
  FOR stop_row IN
    SELECT id, name, location, sequence_no, geofence_radius_meters
    FROM public.stops
    WHERE route_id = new.route_id
    ORDER BY sequence_no ASC
  LOOP
    -- Check if coordinates fall within geofence radius (using geography type cast to measure in meters)
    IF ST_DWithin(stop_row.location::geography, new.coordinates::geography, stop_row.geofence_radius_meters) THEN
      
      -- Check if we already registered an arrival for this stop today
      SELECT EXISTS (
        SELECT 1 FROM public.stop_arrivals_log
        WHERE stop_id = stop_row.id
          AND trip_date = CURRENT_DATE
      ) INTO stop_arrived_today;

      -- If arrival is NOT logged today, record arrival and prepare alerts for the next stop
      IF NOT stop_arrived_today THEN
        INSERT INTO public.stop_arrivals_log (tenant_id, route_id, stop_id, trip_date)
        VALUES (new.tenant_id, new.route_id, stop_row.id, CURRENT_DATE)
        ON CONFLICT DO NOTHING;

        -- Query for the next stop in sequence
        SELECT id, name, duration_from_prev_seconds, sequence_no
        FROM public.stops
        WHERE route_id = new.route_id
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

          -- Fetch students assigned to Stop N+1 (pickup or dropoff)
          FOR student_row IN
            SELECT s.id as student_id, s.name as student_name, s.parent_id
            FROM public.students s
            WHERE s.route_id = new.route_id
              AND (s.pickup_stop_id = next_stop_row.id OR s.dropoff_stop_id = next_stop_row.id)
          LOOP
            
            -- Enforce single alert dispatch per student per day
            SELECT EXISTS (
              SELECT 1 FROM public.sent_proximity_alerts
              WHERE student_id = student_row.student_id
                AND trip_date = CURRENT_DATE
            ) INTO alert_exists;

            IF NOT alert_exists THEN
              INSERT INTO public.sent_proximity_alerts (tenant_id, student_id, trip_date)
              VALUES (new.tenant_id, student_row.student_id, CURRENT_DATE)
              ON CONFLICT (student_id, trip_date) DO NOTHING;

              sms_body := 'Safaricom Track: The school bus has departed ' || stop_row.name || 
                          ' and is headed to ' || next_stop_row.name || 
                          '. Estimated ETA is ' || eta_str || 
                          ' (approx. ' || eta_mins || ' mins away). Please prepare ' || 
                          student_row.student_name || ' for transit.';

              INSERT INTO public.alerts_queue (tenant_id, student_id, parent_id, message_type, custom_message)
              VALUES (new.tenant_id, student_row.student_id, student_row.parent_id, 'proximity', sms_body);
            END IF;
            
          END LOOP;
        END IF;
      END IF;
      
    END IF;
  END LOOP;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
