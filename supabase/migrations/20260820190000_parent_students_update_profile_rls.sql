-- Allow authenticated parents to update their linked children's profile fields
-- (avatar, attendance status, home location, and student info edits).
DROP POLICY IF EXISTS "Parents can update their own children" ON public.students;
CREATE POLICY "Parents can update their own children"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (parent_id = (SELECT auth.uid()))
  WITH CHECK (parent_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.restrict_parent_student_column_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (jwt_role())::text = 'parent' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
       OR NEW.route_id IS DISTINCT FROM OLD.route_id
       OR NEW.campus_id IS DISTINCT FROM OLD.campus_id
       OR NEW.nfc_card_hash IS DISTINCT FROM OLD.nfc_card_hash
       OR NEW.pickup_stop_id IS DISTINCT FROM OLD.pickup_stop_id
       OR NEW.dropoff_stop_id IS DISTINCT FROM OLD.dropoff_stop_id
       OR NEW.schedule_ids IS DISTINCT FROM OLD.schedule_ids
    THEN
      RAISE EXCEPTION 'Parents cannot change school assignment fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_parent_student_column_updates ON public.students;
CREATE TRIGGER trg_restrict_parent_student_column_updates
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_parent_student_column_updates();
