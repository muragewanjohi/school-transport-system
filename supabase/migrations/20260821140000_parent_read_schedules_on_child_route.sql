-- Allow parents to read schedules on their children's routes (Profile pickup/drop-off trip details).
DROP POLICY IF EXISTS "Parents can read schedules on child's route" ON public.schedules;
CREATE POLICY "Parents can read schedules on child's route" ON public.schedules
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (SELECT route_id FROM public.students WHERE parent_id = auth.uid())
  );
