-- Parents need to see in-progress trips on their child's route so the
-- Flutter map can fall back when /api/parent/live is unavailable.

DROP POLICY IF EXISTS "Parents can view trips for child's routes" ON public.trips;
CREATE POLICY "Parents can view trips for child's routes" ON public.trips
  FOR SELECT
  USING (
    tenant_id = public.jwt_tenant_id()
    AND public.jwt_role() = 'parent'
    AND route_id IN (
      SELECT s.route_id
      FROM public.students s
      WHERE s.parent_id = auth.uid()
        AND s.route_id IS NOT NULL
    )
  );
