import { describe, expect, it } from "vitest";
import {
  NONE_TRIP_ID,
  formatStudentTripLabel,
  selectedTripSelectValue,
  studentTripSelectOptions,
  tripIdFromSelectValue,
} from "@/lib/studentTripSelect";

describe("studentTripSelectOptions", () => {
  it("includes None plus searchable trip labels with departure time", () => {
    expect(
      studentTripSelectOptions(
        [
          { id: "am", name: "Corridor AM", departure_time: "06:45:00" },
          { id: "lp", name: "Lower Primary Trip", departure_time: "07:00:00" },
        ],
        "None (No Pick up)"
      )
    ).toEqual([
      { id: NONE_TRIP_ID, name: "None (No Pick up)" },
      { id: "am", name: "Corridor AM (06:45:00)" },
      { id: "lp", name: "Lower Primary Trip (07:00:00)" },
    ]);
  });
});

describe("trip select value mapping", () => {
  it("empty schedule maps to None and back", () => {
    expect(selectedTripSelectValue("")).toBe(NONE_TRIP_ID);
    expect(tripIdFromSelectValue(NONE_TRIP_ID)).toBe("");
  });

  it("a real trip id is unchanged", () => {
    expect(selectedTripSelectValue("am")).toBe("am");
    expect(tripIdFromSelectValue("am")).toBe("am");
  });
});

describe("formatStudentTripLabel", () => {
  it("shows name and time like the location dropdown labels", () => {
    expect(formatStudentTripLabel("Corridor PM", "15:30:00")).toBe("Corridor PM (15:30:00)");
  });
});
