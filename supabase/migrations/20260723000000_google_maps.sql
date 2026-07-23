-- Migration: Add Google Maps API Key configuration to tenant_configs
ALTER TABLE public.tenant_configs 
ADD COLUMN IF NOT EXISTS google_maps_api_key TEXT;
