# Pilot: Lock 3 CP35 tags via OnTheBus

Physical verification checklist (founder). Software path is implemented; this confirms the password lock on hardware.

## Prerequisites

1. Apply migration `supabase/migrations/20260915120000_student_beacon_tags.sql` to the linked Supabase project.
2. Build/run Driver App Android with Bluetooth on.
3. Driver/conductor OTP login against a real or QA tenant.

## Steps per tag (CP35-49B1 Minor 1, then 2, then 3)

1. Home → bluetooth icon → **Provision Tag**.
2. **Load template** (enter provision PIN if configured).
3. **Scan nearby tags** → select the physical tag.
4. Pick a student → **Provision & lock tag**.
5. Confirm snackbar: *Tag locked — only OnTheBus can reconfigure this tag.*

## Verify DX-SMART blocked

1. Open DX-SMART → connect to the same tag.
2. Enter factory password `DX1234` → must **fail**.
3. Optionally enter the tenant password from a secure note (from first template generation) → may succeed; OnTheBus remains the supported path.

## Record

| Tag | MAC | Minor | Student | DX-SMART DX1234 failed? |
| :--- | :--- | :--- | :--- | :--- |
| CP35-49B1 | | 1 | | |
| Tag 2 | | 2 | | |
| Tag 3 | | 3 | | |

**Note:** Until the vendor AAR is wired into `DxBeaconPlugin`, provision uses the **stub** MethodChannel (simulates success). For real password writes on hardware, drop the DX-SMART SDK AAR into `apps/driver_app/android/app/libs/` and replace stub methods, or complete the write once via DX-SMART with the tenant password from the API template `new_device_password`.
