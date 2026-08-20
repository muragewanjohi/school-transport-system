export const PICKUP_DIRECTION = "HOME_TO_SCHOOL";
export const DROPOFF_DIRECTION = "SCHOOL_TO_HOME";

export type SequencedStop = {
  id: string;
  sequence_no?: number | null;
};

export type SchoolArrivalRejectReason = "not_in_progress" | "not_pickup" | "not_last_stop";

export const SCHOOL_ARRIVAL_ERRORS: Record<SchoolArrivalRejectReason, string> = {
  not_in_progress: "Trip is not in progress",
  not_pickup: "School arrival auto-complete applies only to pickup trips",
  not_last_stop: "Stop is not the last sequenced stop on this route",
};

export function durationSecondsFromRange(
  startedAt: string | null | undefined,
  completedAt: Date | string
): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  const end = typeof completedAt === "string" ? Date.parse(completedAt) : completedAt.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const secs = Math.floor((end - start) / 1000);
  return secs < 0 ? 0 : secs;
}

export function sortedStopsBySequence(stops: SequencedStop[]): SequencedStop[] {
  return [...stops].sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0));
}

export function firstSequencedStopId(stops: SequencedStop[]): string | null {
  const ordered = sortedStopsBySequence(stops);
  return ordered[0]?.id ?? null;
}

export function lastSequencedStopId(stops: SequencedStop[]): string | null {
  const ordered = sortedStopsBySequence(stops);
  if (ordered.length === 0) return null;
  return ordered[ordered.length - 1]?.id ?? null;
}

export function isSchoolOriginStop(input: {
  stopId: string;
  stops: SequencedStop[];
  direction: string | null | undefined;
}): boolean {
  if ((input.direction ?? "").toString() !== DROPOFF_DIRECTION) return false;
  return firstSequencedStopId(input.stops) === input.stopId;
}

export function isSchoolDestinationStop(input: {
  stopId: string;
  stops: SequencedStop[];
  direction: string | null | undefined;
}): boolean {
  if ((input.direction ?? "").toString() !== PICKUP_DIRECTION) return false;
  return lastSequencedStopId(input.stops) === input.stopId;
}

export function schoolArrivalRejectReason(input: {
  status: string | null | undefined;
  direction: string | null | undefined;
  stopId: string;
  lastStopId: string | null;
}): SchoolArrivalRejectReason | null {
  if ((input.status ?? "").toString() !== "in_progress") return "not_in_progress";
  if ((input.direction ?? "").toString() !== PICKUP_DIRECTION) return "not_pickup";
  if (!input.lastStopId || input.stopId !== input.lastStopId) return "not_last_stop";
  return null;
}

export type SchoolArrivalDecision =
  | { kind: "idempotent"; durationSeconds: number }
  | { kind: "reject"; reason: SchoolArrivalRejectReason }
  | { kind: "accept" };

export function decideSchoolArrival(input: {
  status: string | null | undefined;
  direction: string | null | undefined;
  stopId: string;
  lastStopId: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationSeconds?: number | null;
}): SchoolArrivalDecision {
  if ((input.status ?? "").toString() === "completed") {
    const persisted = input.durationSeconds;
    const duration =
      typeof persisted === "number"
        ? persisted
        : durationSecondsFromRange(input.startedAt, input.completedAt ?? new Date());
    return { kind: "idempotent", durationSeconds: duration };
  }
  const reason = schoolArrivalRejectReason(input);
  if (reason) return { kind: "reject", reason };
  return { kind: "accept" };
}

export const MOCK_SCHOOL_ARRIVAL = {
  pickupInProgress: {
    tripId: "11111111-1111-4111-8111-111111111111",
    lastStopId: "22222222-2222-4222-8222-222222222222",
    midStopId: "33333333-3333-4333-8333-333333333333",
    direction: PICKUP_DIRECTION,
    status: "in_progress",
    startedAt: "2026-08-20T07:00:00.000Z",
  },
  dropoffInProgress: {
    tripId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    lastStopId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    direction: DROPOFF_DIRECTION,
    status: "in_progress",
    startedAt: "2026-08-20T07:00:00.000Z",
  },
  pickupCompleted: {
    tripId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    lastStopId: "22222222-2222-4222-8222-222222222222",
    direction: PICKUP_DIRECTION,
    status: "completed",
    startedAt: "2026-08-20T07:00:00.000Z",
    completedAt: "2026-08-20T07:32:00.000Z",
    durationSeconds: 1920,
  },
} as const;

export type MockSchoolArrivalTrip = {
  tripId: string;
  lastStopId: string;
  midStopId?: string;
  direction: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
};

export function mockSchoolArrivalTrip(tripId: string): MockSchoolArrivalTrip | null {
  const rows: MockSchoolArrivalTrip[] = [
    MOCK_SCHOOL_ARRIVAL.pickupInProgress,
    MOCK_SCHOOL_ARRIVAL.dropoffInProgress,
    MOCK_SCHOOL_ARRIVAL.pickupCompleted,
  ];
  return rows.find((row) => row.tripId === tripId) ?? null;
}
