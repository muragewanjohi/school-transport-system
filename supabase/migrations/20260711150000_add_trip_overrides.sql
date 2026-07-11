-- Migration to add custom override fields to trips table
-- Enables delayed departure times, custom status labels, and descriptions for daily runs

ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS custom_departure_time TEXT,
ADD COLUMN IF NOT EXISTS status_override TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;
