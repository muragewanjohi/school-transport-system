export const NONE_TRIP_ID = "__none__";

export type StudentTripSchedule = {
  id: string;
  name: string;
  departure_time: string;
  direction: string;
  route_id: string;
};

export function formatStudentTripLabel(name: string, departureTime: string): string {
  return `${name} (${departureTime})`;
}

export function studentTripSelectOptions(
  schedules: Pick<StudentTripSchedule, "id" | "name" | "departure_time">[],
  noneLabel: string
): Array<{ id: string; name: string }> {
  return [
    { id: NONE_TRIP_ID, name: noneLabel },
    ...schedules.map((schedule) => ({
      id: schedule.id,
      name: formatStudentTripLabel(schedule.name, schedule.departure_time),
    })),
  ];
}

export function selectedTripSelectValue(scheduleId: string): string {
  return scheduleId || NONE_TRIP_ID;
}

export function tripIdFromSelectValue(value: string): string {
  return value === NONE_TRIP_ID ? "" : value;
}
