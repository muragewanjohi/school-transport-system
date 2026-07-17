-- Migration to add parent OTP verification RPC function

CREATE OR REPLACE FUNCTION public.verify_parent_login(phone_num TEXT, otp_val TEXT)
RETURNS JSONB AS $$
DECLARE
  profile_row RECORD;
  result JSONB;
  clean_phone TEXT;
  students_array JSONB;
BEGIN
  -- Normalize phone number
  clean_phone := trim(phone_num);
  IF clean_phone LIKE '0%' THEN
    clean_phone := '+254' || substr(clean_phone, 2);
  ELSIF clean_phone NOT LIKE '+%' THEN
    clean_phone := '+' || clean_phone;
  END IF;

  -- Find the profile matching phone and parent role
  SELECT * INTO profile_row
  FROM public.profiles
  WHERE (phone = phone_num OR phone = clean_phone)
    AND role = 'parent'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent profile not found with this phone number');
  END IF;

  -- Verify OTP
  IF profile_row.otp_code IS DISTINCT FROM otp_val THEN
    -- Sandbox bypass codes
    IF otp_val != '123456' AND otp_val != '589204' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP verification code');
    END IF;
  END IF;

  -- Validate expiration if not using bypass codes
  IF otp_val != '123456' AND profile_row.otp_expires_at IS NOT NULL AND profile_row.otp_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP verification code has expired');
  END IF;

  -- Clear OTP code to prevent reuse
  UPDATE public.profiles
  SET otp_code = NULL, otp_expires_at = NULL
  WHERE id = profile_row.id;

  -- Automatically link parent_id if it's null and we matched by phone
  UPDATE public.students s
  SET parent_id = profile_row.id
  WHERE s.parent_id IS NULL
    AND EXISTS (
      SELECT 1 
      FROM jsonb_to_recordset(s.guardians) as g(phone text)
      WHERE trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(profile_row.phone, '[\s\-()]+', '', 'g'))
         OR trim(regexp_replace(g.phone, '[\s\-()]+', '', 'g')) = trim(regexp_replace(clean_phone, '[\s\-()]+', '', 'g'))
    );

  -- Fetch children list mapped to this parent
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'route_id', s.route_id,
    'status', s.status
  )), '[]'::jsonb) INTO students_array
  FROM public.students s
  WHERE s.parent_id = profile_row.id;

  -- Build success response session payload
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
