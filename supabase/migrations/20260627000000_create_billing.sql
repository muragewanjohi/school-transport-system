-- Create billing_status table in public schema
CREATE TABLE IF NOT EXISTS public.billing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan_name TEXT DEFAULT 'Pro' NOT NULL,
    price_desc TEXT DEFAULT 'KES 10,000 / month + KES 1 / SMS' NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE NOT NULL,
    next_renewal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now() + interval '1 month') NOT NULL,
    students_count INT DEFAULT 214 NOT NULL,
    active_routes_count INT DEFAULT 5 NOT NULL,
    drivers_count INT DEFAULT 6 NOT NULL,
    sms_used_this_month INT DEFAULT 16000 NOT NULL,
    sms_limit_expected INT DEFAULT 25000 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.billing_status ENABLE ROW LEVEL SECURITY;

-- 1. School Admins can read billing details for their own school
CREATE POLICY "School Admins can read billing details" ON public.billing_status
  FOR SELECT USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 2. School Admins can update billing details (e.g. paying invoices) for their own school
CREATE POLICY "School Admins can update billing details" ON public.billing_status
  FOR UPDATE USING (tenant_id = public.jwt_tenant_id() AND public.jwt_role() = 'school_admin');

-- 3. Super Admins can manage all billing details
CREATE POLICY "Super Admins can manage all billing" ON public.billing_status
  FOR ALL USING (public.jwt_role() = 'super_admin');

-- Auto-insert billing rows for any existing tenants in the sandbox
INSERT INTO public.billing_status (tenant_id, is_paid)
SELECT id, false FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;
