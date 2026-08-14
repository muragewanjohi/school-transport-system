export const STOP_VISIT_OUTCOMES = ["completed", "visited", "skipped"] as const;
export type StopVisitOutcome = (typeof STOP_VISIT_OUTCOMES)[number];

export type StopExitReason = "complete_pressed" | "skip_pressed" | "left_geofence";

export type StopExitResolution = {
  outcome: StopVisitOutcome;
  alertAdmin: boolean;
};

/** Rank so a later weaker event cannot overwrite a stronger one. */
const OUTCOME_RANK: Record<StopVisitOutcome, number> = {
  skipped: 1,
  visited: 2,
  completed: 3,
};

export function resolveStopExit(input: {
  reason: StopExitReason;
  studentsActioned: number;
}): StopExitResolution {
  if (input.reason === "complete_pressed") {
    return { outcome: "completed", alertAdmin: false };
  }
  if (input.reason === "skip_pressed") {
    return { outcome: "skipped", alertAdmin: true };
  }
  if (input.studentsActioned > 0) {
    return { outcome: "completed", alertAdmin: false };
  }
  return { outcome: "visited", alertAdmin: true };
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
