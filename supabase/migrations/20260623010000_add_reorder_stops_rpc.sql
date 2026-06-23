-- Create reorder_stops database RPC utility to resequence stops safely without violating UNIQUE constraint
CREATE OR REPLACE FUNCTION public.reorder_stops(stop_ids UUID[])
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  -- 1. Temporarily move sequences to negative to avoid unique constraint collisions
  FOR i IN 1..array_length(stop_ids, 1) LOOP
    UPDATE public.stops
    SET sequence_no = -i
    WHERE id = stop_ids[i];
  END LOOP;

  -- 2. Restore sequences to their final positive values in the requested order
  FOR i IN 1..array_length(stop_ids, 1) LOOP
    UPDATE public.stops
    SET sequence_no = i
    WHERE id = stop_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
