-- Create tenant_configs table in public schema
CREATE TABLE IF NOT EXISTS public.tenant_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Tab 1: General School Profile
    school_name TEXT NOT NULL,
    school_phone TEXT,
    school_email TEXT,
    school_address TEXT,
    logo_url TEXT,
    
    -- Tab 2: Transport & Alert Settings
    geofence_radius_meters INT DEFAULT 500 NOT NULL,
    notify_on_trip_start BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_geofence_entry BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_boarded BOOLEAN DEFAULT TRUE NOT NULL,
    sms_template_geofence TEXT DEFAULT 'Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.' NOT NULL,
    sms_template_boarded TEXT DEFAULT 'Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.' NOT NULL,
    
    -- Tab 3: Operational Calendar & Working Hours
    operating_hours_start TIME DEFAULT '06:00:00' NOT NULL,
    operating_hours_end TIME DEFAULT '18:00:00' NOT NULL,
    operating_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']::TEXT[] NOT NULL,
    holidays JSONB DEFAULT '[]'::JSONB NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

-- 1. School Admins can manage config for their own school
CREATE POLICY "School Admins can manage own Tenant Config" ON public.tenant_configs
  FOR ALL USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 2. Super Admins can manage all config details
CREATE POLICY "Super Admins can manage all Tenant Configs" ON public.tenant_configs
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- Auto-insert config rows for any existing tenants in the sandbox
INSERT INTO public.tenant_configs (tenant_id, school_name, school_phone, school_email, school_address)
SELECT 
  id, 
  name, 
  '+254 700 000 000', 
  'admin@' || domain, 
  'Nairobi, Kenya'
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;
