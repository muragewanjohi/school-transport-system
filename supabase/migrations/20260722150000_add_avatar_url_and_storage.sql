-- Migration: Schema Updates for Photo Avatars (Drivers, Conductors, Parents, Students), Home Location Address, and Supabase Storage Buckets

-- 1. Add avatar_url column to public.profiles table (Used for Drivers, Conductors, Parents, and Guardians)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Add avatar_url, address, and transit_status columns to public.students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS transit_status TEXT DEFAULT 'pending';

-- 3. Create 'avatars' storage bucket in Supabase Storage if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable Storage RLS Policies for 'avatars' bucket (with IF EXISTS guards)
DO $$ 
BEGIN
    -- Drop existing policies if they exist to avoid migration re-run conflicts
    DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Public Upload Avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Public Update Avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Public Delete Avatars" ON storage.objects;
END $$;

CREATE POLICY "Public Read Avatars" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Public Upload Avatars" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public Update Avatars" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars');

CREATE POLICY "Public Delete Avatars" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars');
