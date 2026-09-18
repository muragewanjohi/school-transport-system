import { DEFAULT_PREDEPARTURE_GRACE_MINUTES } from "@/lib/predepartureCheck";
import type { TripRunStatus } from "@/lib/tripStatusUi";

/** UI-only: never-started runs show Missed this many minutes after scheduled departure. Not persisted. */
export const DISPLAY_MISSED_AFTER_MINUTES = 30;

export type TripRowForDisplay = {
  status?: string | null;
  status_override?: string | null;
};

/**
 * Maps a daily trip row (or a schedule with no trip yet) to the console status chip.
 * Persisted override / trip.status win. Otherwise Delayed matches the pre-departure
 * grace (10 min); Missed is display-only after 30 min.
 */
export function mapTodayTripDisplayStatus(
  scheduleTime: string,
  dbTrip: TripRowForDisplay | undefined,
  now: Date = new Date(),
  delayedAfterMinutes: number = DEFAULT_PREDEPARTURE_GRACE_MINUTES,
  missedAfterMinutes: number = DISPLAY_MISSED_AFTER_MINUTES
): TripRunStatus {
  if (dbTrip) {
    if (dbTrip.status_override) return dbTrip.status_override as TripRunStatus;
    if (dbTrip.status === "completed") return "Completed";
    if (dbTrip.status === "cancelled") return "Cancelled";
    if (dbTrip.status === "in_progress") return "Active";
  }

  const [schedH, schedM] = scheduleTime.split(":").map(Number);
  if (!Number.isFinite(schedH) || !Number.isFinite(schedM)) return "Scheduled";

  const schedDate = new Date(now);
  schedDate.setHours(schedH, schedM, 0, 0);
  const diffMins = (now.getTime() - schedDate.getTime()) / (1000 * 60);

  if (diffMins > missedAfterMinutes) return "Missed";
  if (diffMins > delayedAfterMinutes) return "Delayed";
  return "Scheduled";
}
