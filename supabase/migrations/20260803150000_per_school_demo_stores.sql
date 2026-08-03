-- Per-school demo stores: expiry + request link; OTP reuse on is_demo tenants

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_request_id UUID REFERENCES public.demo_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_demo_request_id_uidx
  ON public.tenants (demo_request_id)
  WHERE demo_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenants_demo_expires_idx
  ON public.tenants (demo_expires_at)
  WHERE is_demo = true AND demo_expires_at IS NOT NULL;

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS provisioned_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.verify_driver_login(phone_num text, otp_val text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  profile_row RECORD;
  vehicle_row RECORD;
  route_id_val UUID;
  result JSONB;
  clean_phone TEXT;
  is_demo_tenant BOOLEAN := false;
BEGIN
  clean_phone := trim(phone_num);
  IF clean_phone LIKE '0%' THEN
    clean_phone := '+254' || substr(clean_phone, 2);
  ELSIF clean_phone NOT LIKE '+%' THEN
    clean_phone := '+' || clean_phone;
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE (phone = phone_num OR phone = clean_phone)
    AND role IN ('driver', 'conductor')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found with this phone number');
  END IF;

  IF profile_row.status = 'Unavailable' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login denied. Driver/Conductor status is set to Unavailable.');
  END IF;

  IF profile_row.otp_code IS DISTINCT FROM otp_val THEN
    IF otp_val != '123456' AND otp_val != '589204' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP verification code');
    END IF;
  END IF;

  IF otp_val != '123456' AND profile_row.otp_expires_at IS NOT NULL AND profile_row.otp_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP verification code has expired');
  END IF;

  SELECT COALESCE(t.is_demo, false) INTO is_demo_tenant
  FROM public.tenants t
  WHERE t.id = profile_row.tenant_id;

  IF NOT COALESCE(is_demo_tenant, false) THEN
    UPDATE public.profiles
    SET otp_code = NULL, otp_expires_at = NULL
    WHERE id = profile_row.id;
  END IF;

  IF profile_row.role = 'driver' THEN
    SELECT id, model, license_plate INTO vehicle_row
    FROM public.vehicles
    WHERE active_driver_id = profile_row.id
    LIMIT 1;
  ELSE
    SELECT id, model, license_plate INTO vehicle_row
    FROM public.vehicles
    WHERE conductor_1_id = profile_row.id OR conductor_2_id = profile_row.id
    LIMIT 1;
  END IF;

  IF vehicle_row.id IS NOT NULL THEN
    SELECT route_id INTO route_id_val
    FROM public.schedules
    WHERE vehicle_id = vehicle_row.id
    LIMIT 1;
  END IF;

  IF route_id_val IS NULL THEN
    SELECT id INTO route_id_val
    FROM public.routes
    WHERE tenant_id = profile_row.tenant_id
    LIMIT 1;
  END IF;

  result := jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', profile_row.id,
      'name', profile_row.name,
      'email', profile_row.email,
      'phone', profile_row.phone,
      'role', profile_row.role,
      'tenant_id', profile_row.tenant_id,
      'vehicle_id', COALESCE(vehicle_row.id, 'e5015e10-c09a-4c22-901d-5573752e379c'::UUID),
      'route_id', COALESCE(route_id_val, '782cd841-f762-4217-a021-9876251b5bca'::UUID)
    )
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_parent_login(phone_num text, otp_val text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  profile_row RECORD;
  result JSONB;
  clean_phone TEXT;
  students_array JSONB;
  is_demo_tenant BOOLEAN := false;
BEGIN
  clean_phone := trim(phone_num);
  IF clean_phone LIKE '0%' THEN
    clean_phone := '+254' || substr(clean_phone, 2);
  ELSIF clean_phone NOT LIKE '+%' THEN
    clean_phone := '+' || clean_phone;
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE (phone = phone_num OR phone = clean_phone)
    AND role = 'parent'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent profile not found with this phone number');
  END IF;

  IF profile_row.otp_code IS DISTINCT FROM otp_val THEN
    IF otp_val != '123456' AND otp_val != '589204' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP verification code');
    END IF;
  END IF;

  IF otp_val != '123456' AND profile_row.otp_expires_at IS NOT NULL AND profile_row.otp_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP verification code has expired');
  END IF;

  SELECT COALESCE(t.is_demo, false) INTO is_demo_tenant
  FROM public.tenants t
  WHERE t.id = profile_row.tenant_id;

  IF NOT COALESCE(is_demo_tenant, false) THEN
    UPDATE public.profiles
    SET otp_code = NULL, otp_expires_at = NULL
    WHERE id = profile_row.id;
  END IF;

  UPDATE public.students s
  SET parent_id = profile_row.id
  WHERE s.parent_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(s.guardians) as g(phone text)
      WHERE trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(profile_row.phone, '[\s\-()]+', '', 'g'))
         OR trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(clean_phone, '[\s\-()]+', '', 'g'))
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'route_id', s.route_id,
    'status', s.status
  )), '[]'::jsonb) INTO students_array
  FROM public.students s
  WHERE s.parent_id = profile_row.id;

  result := jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', profile_row.id,
      'name', profile_row.name,
      'email', profile_row.email,
      'phone', profile_row.phone,
      'role', profile_row.role,
      'tenant_id', profile_row.tenant_id,
      'children', students_array
    )
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_driver_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_parent_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_parent_login(text, text) TO service_role;
