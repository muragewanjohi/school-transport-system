-- Allow buses to be saved without maker/model or seating capacity.
ALTER TABLE public.vehicles
  ALTER COLUMN model DROP NOT NULL;

ALTER TABLE public.vehicles
  ALTER COLUMN capacity DROP NOT NULL;
