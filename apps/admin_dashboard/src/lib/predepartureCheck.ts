/** Pure helpers for pre-departure delay detection (cron). */

export const DEFAULT_PREDEPARTURE_GRACE_MINUTES = 10;
export const PREDEPARTURE_STATUS_OVERRIDE = "Delayed";
export const PREDEPARTURE_DESCRIPTION =
  "Bus has not departed as scheduled (automatic pre-departure check).";

export type PredepartureTripCandidate = {
  id: string;
  status: string;
  started_at: string | null;
  status_override: string | null;
  custom_departure_time: string | null;
  trip_date: string; // YYYY-MM-DD
  departure_time: string; // HH:MM:SS or HH:MM from schedule
};

/**
 * Builds an instant for trip_date + local clock time in Africa/Nairobi.
 * Accepts "HH:MM", "HH:MM:SS", or free-text times that start with a clock.
 */
export function resolveExpectedDepartureUtc(
  tripDate: string,
  departureText: string,
  timeZone = "Africa/Nairobi"
): Date | null {
  const clockMatch = departureText.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!clockMatch) {
    return null;
  }
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const second = Number(clockMatch[3] ?? "0");
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  // Interpret wall time in East Africa as an offset-fixed ISO (EAT = UTC+3, no DST).
  if (timeZone !== "Africa/Nairobi") {
    return null;
  }
  const iso = `${tripDate}T${hh}:${mm}:${ss}+03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function effectiveDepartureText(trip: PredepartureTripCandidate): string {
  const custom = trip.custom_departure_time?.trim();
  if (custom) return custom;
  return trip.departure_time;
}

export function alreadyPredepartureAlerted(statusOverride: string | null | undefined): boolean {
  if (!statusOverride) return false;
  return /delay/i.test(statusOverride);
}

/**
 * Whether this candidate should be marked Delayed by the cron.
 */
export function shouldMarkPredepartureDelayed(
  trip: PredepartureTripCandidate,
  now: Date,
  graceMinutes = DEFAULT_PREDEPARTURE_GRACE_MINUTES
): boolean {
  if (trip.status !== "scheduled") return false;
  if (trip.started_at) return false;
  if (alreadyPredepartureAlerted(trip.status_override)) return false;

  const expected = resolveExpectedDepartureUtc(trip.trip_date, effectiveDepartureText(trip));
  if (!expected) return false;

  const thresholdMs = expected.getTime() + graceMinutes * 60 * 1000;
  return now.getTime() >= thresholdMs;
}

export function predepartureUpdatePayload() {
  return {
    status_override: PREDEPARTURE_STATUS_OVERRIDE,
    description: PREDEPARTURE_DESCRIPTION,
  };
}
