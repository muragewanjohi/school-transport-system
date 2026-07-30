-- Align default tenant domain with subdomain slug model ({slug}.onthebusapp.com)
UPDATE public.tenants
SET domain = 'safaricom-track'
WHERE id = '8c9ad841-f762-4217-a021-9876251b5bcf'
  AND domain IN ('safaricom-track.school', 'safaricom-track');
