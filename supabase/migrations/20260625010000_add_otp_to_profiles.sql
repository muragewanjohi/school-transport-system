-- Add otp_code and otp_expires_at columns to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;

-- Create an index on phone and otp_code for high-speed authentication searches
CREATE INDEX IF NOT EXISTS idx_profiles_phone_otp ON public.profiles(phone, otp_code);

-- Add is_emergency column to public.live_coordinates table
ALTER TABLE public.live_coordinates ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE;
