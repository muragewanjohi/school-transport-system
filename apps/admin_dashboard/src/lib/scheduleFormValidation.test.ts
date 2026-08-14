import { describe, expect, it } from "vitest";
import {
  formatScheduleApiErrors,
  summarizeMissingScheduleFields,
  tripTypeLabel,
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

  it("missing trip type › names Trip type instead of a generic save failure", () => {
    const errors = validateScheduleForm({ ...valid, direction: "" });
    expect(errors.direction).toBe("Select pick up or drop off");
    expect(summarizeMissingScheduleFields(errors)).toBe("Please fill in: Trip type");
  });

  it("pick up › maps to HOME_TO_SCHOOL label Pick up", () => {
    expect(tripTypeLabel("HOME_TO_SCHOOL")).toBe("Pick up");
    expect(validateScheduleForm({ ...valid, direction: "HOME_TO_SCHOOL" })).toEqual({});
  });

  it("drop off › maps to SCHOOL_TO_HOME label Drop off", () => {
    expect(tripTypeLabel("SCHOOL_TO_HOME")).toBe("Drop off");
    expect(validateScheduleForm({ ...valid, direction: "SCHOOL_TO_HOME" })).toEqual({});
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
