-- Seed the default tenant if it does not exist
INSERT INTO public.tenants (id, name, domain)
VALUES ('8c9ad841-f762-4217-a021-9876251b5bcf', 'Safaricom Track School', 'safaricom-track.school')
ON CONFLICT (id) DO NOTHING;

-- Update handle_new_user trigger function to safely fall back to default metadata values
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, role, admin_role, name, email, phone, status)
  VALUES (
    new.id,
    COALESCE(
      nullif(new.raw_user_meta_data->>'tenant_id', '')::UUID,
      '8c9ad841-f762-4217-a021-9876251b5bcf'::UUID
    ),
    COALESCE(nullif(new.raw_user_meta_data->>'role', ''), 'school_admin'),
    COALESCE(nullif(new.raw_user_meta_data->>'admin_role', ''), 'Super Admin'),
    COALESCE(nullif(new.raw_user_meta_data->>'name', ''), 'Unknown User'),
    new.email,
    COALESCE(new.phone, new.raw_user_meta_data->>'phone'),
    'Available'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role,
    admin_role = COALESCE(profiles.admin_role, EXCLUDED.admin_role),
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = COALESCE(profiles.phone, EXCLUDED.phone);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
