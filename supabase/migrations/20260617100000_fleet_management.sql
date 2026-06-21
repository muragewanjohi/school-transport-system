-- Alter profiles check constraint to allow 'conductor' role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'school_admin', 'driver', 'parent', 'conductor'));

-- Extend Vehicles Table with Fleet Management attributes
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fuel_level INTEGER DEFAULT 100;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer NUMERIC DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS last_service_date DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE;

-- Conductor assignments (A bus can have up to 2 conductors)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS conductor_1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS conductor_2_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Re-apply check constraints to the extended vehicles columns
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_status_check CHECK (status IN ('Active', 'Maintenance', 'Out of Service'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_fuel_level_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_fuel_level_check CHECK (fuel_level >= 0 AND fuel_level <= 100);

-- Enable RLS and add Conductor read policies to vehicles
CREATE POLICY "Conductors can read vehicles inside Tenant" ON public.vehicles
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'conductor'
  );

-- Create Maintenance Logs Table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    cost NUMERIC,
    service_date DATE DEFAULT CURRENT_DATE NOT NULL,
    technician TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on maintenance_logs
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Configure RLS Policies for maintenance_logs
CREATE POLICY "School Admins can manage Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

CREATE POLICY "Super Admins can manage all Maintenance Logs" ON public.maintenance_logs
  FOR ALL USING (public.jwt_role() = 'super_admin');

CREATE POLICY "Drivers can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'driver');

CREATE POLICY "Conductors can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'conductor');

CREATE POLICY "Parents can read Maintenance Logs inside Tenant" ON public.maintenance_logs
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id() 
    AND public.jwt_role() = 'parent'
  );

-- Create index on vehicle_id in maintenance_logs for query optimization
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_vehicle_id ON public.maintenance_logs(vehicle_id);
