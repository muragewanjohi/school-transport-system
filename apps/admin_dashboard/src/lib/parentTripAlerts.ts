export const CAMPUS_EXIT_RADIUS_METERS = 150;
export const DEFAULT_APPROACH_RADIUS_METERS = 500;

export type ParentAlertKind = "campus_exit" | "proximity";
export type TransitDirection = "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";

export type ParentAlertKey = {
  studentId: string;
  tripId: string;
  kind: ParentAlertKind;
};

export type StopLeg = {
  id: string;
  sequence_no: number;
  duration_from_prev_seconds: number;
};

const DEFAULT_CAMPUS_EXIT_TEMPLATE =
  "Hi {parent_name}, Bus {vehicle_plate} has left school. {student_name} will be {action} at {stop_name} around {eta_time} (about {duration_mins} min).";

export function isOutsideCampus(
  distanceMeters: number | null | undefined,
  radiusMeters = CAMPUS_EXIT_RADIUS_METERS
): boolean {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return true;
  return distanceMeters > radiusMeters;
}

export function isWithinApproachRing(
  distanceMeters: number,
  radiusMeters = DEFAULT_APPROACH_RADIUS_METERS
): boolean {
  return Number.isFinite(distanceMeters) && distanceMeters <= radiusMeters;
}

export function alreadySentKind(
  sent: ReadonlyArray<ParentAlertKey>,
  studentId: string,
  tripId: string,
  kind: ParentAlertKind
): boolean {
  return sent.some((row) => row.studentId === studentId && row.tripId === tripId && row.kind === kind);
}

/** In-app/push always. SMS is queued only when the school enabled it. */
export function shouldQueueParentSms(smsNotificationsEnabled: boolean | null | undefined): boolean {
  return smsNotificationsEnabled === true;
}

export function shouldSendCampusExit(input: {
  outsideCampus: boolean;
  alreadySent: boolean;
}): boolean {
  return input.outsideCampus && !input.alreadySent;
}

export function shouldSendStageApproach(input: {
  withinApproachRing: boolean;
  alreadySent: boolean;
}): boolean {
  return input.withinApproachRing && !input.alreadySent;
}

/** Sum stored leg durations from route start through the student's stop (inclusive). */
export function etaSecondsToStop(stops: ReadonlyArray<StopLeg>, studentStopId: string): number {
  const ordered = [...stops].sort((a, b) => a.sequence_no - b.sequence_no);
  const index = ordered.findIndex((s) => s.id === studentStopId);
  if (index < 0) return 0;
  let total = 0;
  for (let i = 0; i <= index; i += 1) {
    const dur = ordered[i]?.duration_from_prev_seconds ?? 0;
    total += Number.isFinite(dur) && dur > 0 ? dur : 0;
  }
  return total;
}

export function durationMinsFromSeconds(seconds: number): number {
  const mins = Math.round(seconds / 60);
  return mins <= 0 ? 5 : mins;
}

export function formatCampusExitMessage(input: {
  parentName: string;
  studentName: string;
  vehiclePlate: string;
  stopName: string;
  etaTime: string;
  durationMins: number;
  direction: TransitDirection;
  template?: string;
}): string {
  const action = input.direction === "SCHOOL_TO_HOME" ? "dropped off" : "picked up";
  const template = input.template?.trim() || DEFAULT_CAMPUS_EXIT_TEMPLATE;
  return template
    .replaceAll("{parent_name}", input.parentName)
    .replaceAll("{student_name}", input.studentName)
    .replaceAll("{vehicle_plate}", input.vehiclePlate)
    .replaceAll("{stop_name}", input.stopName)
    .replaceAll("{eta_time}", input.etaTime)
    .replaceAll("{duration_mins}", String(input.durationMins))
    .replaceAll("{action}", action);
}

export type TripStudentAlert = {
  studentId: string;
  parentName: string;
  studentName: string;
  stopId: string;
  stopName: string;
};

export type EvaluatedParentAlert = {
  studentId: string;
  kind: ParentAlertKind;
  stopName: string;
  durationMins: number;
  message: string;
};

export function evaluateCampusExitAlerts(input: {
  tripId: string;
  outsideCampus: boolean;
  direction: TransitDirection;
  vehiclePlate: string;
  students: ReadonlyArray<TripStudentAlert>;
  stops: ReadonlyArray<StopLeg>;
  alreadySent: ReadonlyArray<ParentAlertKey>;
  now?: Date;
  template?: string;
}): EvaluatedParentAlert[] {
  if (!input.outsideCampus) return [];
  const out: EvaluatedParentAlert[] = [];
  for (const student of input.students) {
    if (alreadySentKind(input.alreadySent, student.studentId, input.tripId, "campus_exit")) {
      continue;
    }
    const seconds = etaSecondsToStop(input.stops, student.stopId);
    const durationMins = durationMinsFromSeconds(seconds);
    const eta = new Date((input.now ?? new Date()).getTime() + seconds * 1000);
    const etaTime = eta.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    out.push({
      studentId: student.studentId,
      kind: "campus_exit",
      stopName: student.stopName,
      durationMins,
      message: formatCampusExitMessage({
        parentName: student.parentName,
        studentName: student.studentName,
        vehiclePlate: input.vehiclePlate,
        stopName: student.stopName,
        etaTime,
        durationMins,
        direction: input.direction,
        template: input.template,
      }),
    });
  }
  return out;
}

export function evaluateStageApproachAlerts(input: {
  tripId: string;
  approachRadiusMeters?: number;
  students: ReadonlyArray<TripStudentAlert & { distanceMeters: number }>;
  alreadySent: ReadonlyArray<ParentAlertKey>;
}): EvaluatedParentAlert[] {
  const radius = input.approachRadiusMeters ?? DEFAULT_APPROACH_RADIUS_METERS;
  const out: EvaluatedParentAlert[] = [];
  for (const student of input.students) {
    if (!shouldSendStageApproach({
      withinApproachRing: isWithinApproachRing(student.distanceMeters, radius),
      alreadySent: alreadySentKind(input.alreadySent, student.studentId, input.tripId, "proximity"),
    })) {
      continue;
    }
    out.push({
      studentId: student.studentId,
      kind: "proximity",
      stopName: student.stopName,
      durationMins: 0,
      message: `Bus is approaching ${student.stopName}. Please prepare ${student.studentName}.`,
    });
  }
  return out;
}
