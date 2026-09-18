import { describe, expect, it } from "vitest";
import { DEFAULT_PREDEPARTURE_GRACE_MINUTES } from "@/lib/predepartureCheck";
import {
  DISPLAY_MISSED_AFTER_MINUTES,
  mapTodayTripDisplayStatus,
} from "@/lib/tripDisplayStatus";

describe("mapTodayTripDisplayStatus", () => {
  const noon = new Date("2026-09-18T12:00:00");

  it("persisted override › wins over clock heuristic", () => {
    expect(
      mapTodayTripDisplayStatus("06:45:00", { status: "scheduled", status_override: "Delayed" }, noon)
    ).toBe("Delayed");
  });

  it("in-progress trip › Active even if clock is late", () => {
    expect(
      mapTodayTripDisplayStatus("06:45:00", { status: "in_progress" }, noon)
    ).toBe("Active");
  });

  it("never-started after grace › Delayed then Missed (display-only)", () => {
    const at0656 = new Date("2026-09-18T06:56:00");
    expect(mapTodayTripDisplayStatus("06:45:00", undefined, at0656)).toBe("Delayed");
    expect(DEFAULT_PREDEPARTURE_GRACE_MINUTES).toBe(10);

    const at0716 = new Date("2026-09-18T07:16:00");
    expect(mapTodayTripDisplayStatus("06:45:00", undefined, at0716)).toBe("Missed");
    expect(DISPLAY_MISSED_AFTER_MINUTES).toBe(30);
  });

  it("before departure › Scheduled", () => {
    const at0640 = new Date("2026-09-18T06:40:00");
    expect(mapTodayTripDisplayStatus("06:45:00", undefined, at0640)).toBe("Scheduled");
  });
});
