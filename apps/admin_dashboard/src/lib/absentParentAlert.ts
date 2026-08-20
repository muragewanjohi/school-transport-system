export const DEFAULT_ABSENT_STOP_TEMPLATE =
  "Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.";

export const DEFAULT_ABSENT_CAMPUS_TEMPLATE =
  "Bus {vehicle_plate}: {student_name} was marked absent before the trip left school at {time}.";

export type AbsentAlertKind = "stop" | "campus";

export type TransitDirection = "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";

/** Campus boarding absents happen on a still-scheduled drop-off. Stop absents happen once the trip is live. */
export function classifyAbsentParentAlert(input: {
  tripStatus: string | null | undefined;
  direction: string | null | undefined;
}): AbsentAlertKind | null {
  const status = (input.tripStatus ?? "").toString();
  const direction = (input.direction ?? "").toString();
  if (status === "in_progress") return "stop";
  if (status === "scheduled" && direction === "SCHOOL_TO_HOME") return "campus";
  return null;
}

export function shouldNotifyAbsent(input: {
  kind: AbsentAlertKind | null;
  notifyOnAbsentStop: boolean | null | undefined;
  notifyOnAbsentCampus: boolean | null | undefined;
}): boolean {
  if (input.kind === "stop") return input.notifyOnAbsentStop !== false;
  if (input.kind === "campus") return input.notifyOnAbsentCampus !== false;
  return false;
}

/** In-app/push follows the event toggle. SMS also needs the school-wide SMS switch. */
export function shouldQueueAbsentSms(input: {
  notifyEnabled: boolean;
  smsNotificationsEnabled: boolean | null | undefined;
}): boolean {
  return input.notifyEnabled && input.smsNotificationsEnabled === true;
}

export function formatAbsentMessage(input: {
  template?: string | null;
  kind: AbsentAlertKind;
  parentName?: string;
  studentName: string;
  vehiclePlate: string;
  stopName: string;
  time: string;
}): string {
  const fallback =
    input.kind === "campus" ? DEFAULT_ABSENT_CAMPUS_TEMPLATE : DEFAULT_ABSENT_STOP_TEMPLATE;
  const template = input.template?.trim() || fallback;
  return template
    .replaceAll("{parent_name}", input.parentName ?? "")
    .replaceAll("{student_name}", input.studentName)
    .replaceAll("{vehicle_plate}", input.vehiclePlate)
    .replaceAll("{bus_number_plate}", input.vehiclePlate)
    .replaceAll("{stop_name}", input.stopName)
    .replaceAll("{stage_name}", input.stopName)
    .replaceAll("{time}", input.time);
}
