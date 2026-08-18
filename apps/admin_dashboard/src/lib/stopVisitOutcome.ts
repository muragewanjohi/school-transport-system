export const STOP_VISIT_OUTCOMES = ["completed", "visited", "skipped"] as const;
export type StopVisitOutcome = (typeof STOP_VISIT_OUTCOMES)[number];

export type StopExitReason = "complete_pressed" | "skip_pressed" | "left_geofence";

export const DEFAULT_MIN_STOP_DWELL_SECONDS = 90;
export const MIN_STOP_DWELL_FLOOR = 60;
export const MIN_STOP_DWELL_CEILING = 180;

export type StopExitResolution = {
  outcome: StopVisitOutcome;
  alertAdmin: boolean;
  markRemainingAbsent: true;
};

/** Rank so a later weaker event cannot overwrite a stronger one. */
const OUTCOME_RANK: Record<StopVisitOutcome, number> = {
  skipped: 1,
  visited: 2,
  completed: 3,
};

export function clampMinStopDwellSeconds(raw: number | null | undefined): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_MIN_STOP_DWELL_SECONDS;
  if (value < MIN_STOP_DWELL_FLOOR) return MIN_STOP_DWELL_FLOOR;
  if (value > MIN_STOP_DWELL_CEILING) return MIN_STOP_DWELL_CEILING;
  return value;
}

export function skipStopAllowed(input: {
  arrivedAt: Date | string | null;
  now: Date | string;
  minStopDwellSeconds?: number | null;
}): boolean {
  if (!input.arrivedAt) return false;
  const min = clampMinStopDwellSeconds(input.minStopDwellSeconds);
  return dwellSeconds(input.arrivedAt, input.now) >= min;
}

export function resolveStopExit(input: {
  reason: StopExitReason;
  studentsActioned: number;
  arrivedAt?: Date | string | null;
  now?: Date | string;
  minStopDwellSeconds?: number | null;
}): StopExitResolution | null {
  if (input.reason === "complete_pressed") {
    return { outcome: "completed", alertAdmin: false, markRemainingAbsent: true };
  }
  const now = input.now ?? new Date();
  if (input.reason === "skip_pressed") {
    if (!skipStopAllowed({
      arrivedAt: input.arrivedAt ?? null,
      now,
      minStopDwellSeconds: input.minStopDwellSeconds,
    })) {
      return null;
    }
    return { outcome: "skipped", alertAdmin: true, markRemainingAbsent: true };
  }
  if (input.studentsActioned > 0) {
    return { outcome: "completed", alertAdmin: false, markRemainingAbsent: true };
  }
  if (!skipStopAllowed({
    arrivedAt: input.arrivedAt ?? null,
    now,
    minStopDwellSeconds: input.minStopDwellSeconds,
  })) {
    return null;
  }
  return { outcome: "visited", alertAdmin: true, markRemainingAbsent: true };
}

export function dwellSeconds(arrivedAt: Date | string | null, departedAt: Date | string): number {
  if (!arrivedAt) return 0;
  const start = typeof arrivedAt === "string" ? new Date(arrivedAt) : arrivedAt;
  const end = typeof departedAt === "string" ? new Date(departedAt) : departedAt;
  const secs = Math.floor((end.getTime() - start.getTime()) / 1000);
  return Number.isFinite(secs) && secs > 0 ? secs : 0;
}

export function shouldOverwriteOutcome(
  existing: StopVisitOutcome | null | undefined,
  incoming: StopVisitOutcome
): boolean {
  if (!existing) return true;
  return OUTCOME_RANK[incoming] > OUTCOME_RANK[existing];
}

export function adminStopAlertMessage(input: {
  outcome: StopVisitOutcome;
  stopName: string;
  routeName: string;
  vehiclePlate?: string | null;
}): string | null {
  const plate = input.vehiclePlate?.trim() || "Bus";
  if (input.outcome === "visited") {
    return `${plate} left ${input.stopName} on ${input.routeName} without completing the stop or boarding students.`;
  }
  if (input.outcome === "skipped") {
    return `${plate} skipped ${input.stopName} on ${input.routeName} (marked not visited).`;
  }
  return null;
}
