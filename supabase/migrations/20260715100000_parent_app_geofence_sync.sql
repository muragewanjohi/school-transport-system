-- Migration to automatically sync geofence boundary polygon whenever a student's pickup_location is updated

-- 1. Create or replace trigger function to sync student geofence
CREATE OR REPLACE FUNCTION public.sync_student_geofence()
RETURNS TRIGGER AS $$
DECLARE
  default_radius NUMERIC := 500; -- Default 500 meters
BEGIN
  -- If pickup_location has changed (or on insert) and is not null, calculate geofence
  IF (TG_OP = 'INSERT' OR NEW.pickup_location IS DISTINCT FROM OLD.pickup_location) THEN
    IF NEW.pickup_location IS NOT NULL THEN
      -- Create/Update circular buffer polygon around new pickup_location point
      INSERT INTO public.geofences (tenant_id, student_id, boundary, radius_meters)
      VALUES (
        NEW.tenant_id,
        NEW.id,
        ST_Buffer(NEW.pickup_location::geography, default_radius)::geometry,
        default_radius
      )
      ON CONFLICT (student_id) 
      DO UPDATE SET 
        boundary = EXCLUDED.boundary,
        radius_meters = EXCLUDED.radius_meters,
        updated_at = now();
    ELSE
      -- If pickup_location set to NULL, clean up geofence
      DELETE FROM public.geofences WHERE student_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on students table
DROP TRIGGER IF EXISTS trg_student_pickup_location_updated ON public.students;
CREATE TRIGGER trg_student_pickup_location_updated
  AFTER INSERT OR UPDATE OF pickup_location
  ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_geofence();
