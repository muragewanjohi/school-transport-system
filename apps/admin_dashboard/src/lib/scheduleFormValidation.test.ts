import { describe, expect, it } from "vitest";
import {
  formatScheduleApiErrors,
  summarizeMissingScheduleFields,
  validateScheduleForm,
} from "@/lib/scheduleFormValidation";

const valid = {
  name: "Early AM Run",
  departure_time: "07:00",
  direction: "HOME_TO_SCHOOL",
  target_grades: ["Grade 1"],
  days_of_week: [1, 2, 3, 4, 5],
};

describe("validateScheduleForm", () => {
  it("missing target grades › names the field instead of a generic save failure", () => {
    const errors = validateScheduleForm({ ...valid, target_grades: [] });
    expect(errors.target_grades).toBe("Select at least one target grade class");
    expect(summarizeMissingScheduleFields(errors)).toBe("Please fill in: Target grade classes");
    expect(summarizeMissingScheduleFields(errors)).not.toMatch(/failed to save schedule/i);
  });

  it("several empty required fields › lists each missing field", () => {
    const errors = validateScheduleForm({
      name: "",
      departure_time: "",
      direction: "HOME_TO_SCHOOL",
      target_grades: [],
      days_of_week: [],
    });
    expect(summarizeMissingScheduleFields(errors)).toBe(
      "Please fill in: Trip name, Departure time, Target grade classes, Operating days"
    );
  });

  it("valid payload › returns no field errors", () => {
    expect(validateScheduleForm(valid)).toEqual({});
  });
});

describe("formatScheduleApiErrors", () => {
  it("maps API field errors to a fill-in summary", () => {
    const message = formatScheduleApiErrors({
      target_grades: ["At least one target grade is required"],
    });
    expect(message).toBe("Please fill in: Target grade classes");
  });
});
