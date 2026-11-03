-- OTP delivery log
-- Spec: context/architecture.md — "OTP delivery log".
-- One row per live login-OTP send attempt (SMS or email). Never stores the OTP
-- code or a full email address. Written only by the service role
-- (issuePhoneOtp + delivery-report webhooks); read by school admins.

CREATE TABLE IF NOT EXISTS public.otp_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  provider TEXT NOT NULL CHECK (provider IN ('africastalking', 'resend')),
  provider_message_id TEXT,
  destination TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'undelivered')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_delivery_log_tenant_profile_created
  ON public.otp_delivery_log (tenant_id, profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_delivery_log_created
  ON public.otp_delivery_log (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_otp_delivery_log_provider_message
  ON public.otp_delivery_log (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.otp_delivery_log ENABLE ROW LEVEL SECURITY;

-- Role from app_metadata only (user_metadata is user-editable).
DROP POLICY IF EXISTS "School admins can read OTP delivery log in tenant" ON public.otp_delivery_log;
CREATE POLICY "School admins can read OTP delivery log in tenant" ON public.otp_delivery_log
  FOR SELECT USING (
    tenant_id = public.jwt_tenant_id()
    AND (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'school_admin'
  );

DROP POLICY IF EXISTS "Super admins can read all OTP delivery logs" ON public.otp_delivery_log;
CREATE POLICY "Super admins can read all OTP delivery logs" ON public.otp_delivery_log
  FOR SELECT USING (
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'super_admin'
  );

-- No INSERT/UPDATE/DELETE policies: only the service role writes.
REVOKE INSERT, UPDATE, DELETE ON public.otp_delivery_log FROM anon, authenticated;
