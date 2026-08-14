export type ScheduleFormInput = {
  name: string;
  departure_time: string;
  direction: string;
  target_grades: string[];
  days_of_week: number[];
  route_id?: string;
};

export const SCHEDULE_FIELD_LABELS: Record<string, string> = {
  name: "Trip name",
  departure_time: "Departure time",
  direction: "Transit direction",
  target_grades: "Target grade classes",
  days_of_week: "Operating days",
  route_id: "Route",
  vehicle_id: "Assigned bus",
};

export function validateScheduleForm(input: ScheduleFormInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.name.trim()) {
    errors.name = "Trip name is required";
  } else if (input.name.trim().length < 2) {
    errors.name = "Trip name must be at least 2 characters";
  }

  if (!input.departure_time.trim()) {
    errors.departure_time = "Departure time is required";
  }

  if (input.direction !== "HOME_TO_SCHOOL" && input.direction !== "SCHOOL_TO_HOME") {
    errors.direction = "Transit direction is required";
  }

  if (input.target_grades.length === 0) {
    errors.target_grades = "Select at least one target grade class";
  }

  if (input.days_of_week.length === 0) {
    errors.days_of_week = "Select at least one operating day";
  }

  if (input.route_id !== undefined && !input.route_id) {
    errors.route_id = "Select a route";
  }

  return errors;
}

export function summarizeMissingScheduleFields(fieldErrors: Record<string, string>): string {
  const labels = Object.keys(fieldErrors)
    .map((key) => SCHEDULE_FIELD_LABELS[key] ?? key)
    .filter((label) => label.length > 0);
  if (labels.length === 0) return "";
  return `Please fill in: ${labels.join(", ")}`;
}

export function formatScheduleApiErrors(
  errors: Record<string, string[] | undefined> | undefined
): string {
  if (!errors) return "";
  const fieldErrors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(errors)) {
    if (messages && messages.length > 0) {
      fieldErrors[key] = messages[0];
    }
  }
  return summarizeMissingScheduleFields(fieldErrors);
}
