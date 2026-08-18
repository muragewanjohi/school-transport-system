import { describe, expect, it } from "vitest";
import {
  adminStopAlertMessage,
  clampMinStopDwellSeconds,
  dwellSeconds,
  resolveStopExit,
  shouldOverwriteOutcome,
} from "@/lib/stopVisitOutcome";

describe("resolveStopExit › complete pressed", () => {
  it("Given Complete Stop, When resolved, Then outcome is completed without admin alert", () => {
    const result = resolveStopExit({ reason: "complete_pressed", studentsActioned: 0 });
    expect(result).toEqual({ outcome: "completed", alertAdmin: false, markRemainingAbsent: true });
  });
});

describe("resolveStopExit › skip pressed", () => {
  const arrivedAt = new Date("2026-08-18T07:00:00Z");

  it("Given Skip Stop after min dwell, When resolved, Then outcome is skipped and admins are alerted", () => {
    const result = resolveStopExit({
      reason: "skip_pressed",
      studentsActioned: 0,
      arrivedAt,
      now: new Date("2026-08-18T07:01:30Z"),
      minStopDwellSeconds: 90,
    });
    expect(result).toEqual({ outcome: "skipped", alertAdmin: true, markRemainingAbsent: true });
  });

  it("Given Skip before min dwell, When resolved, Then skip is refused", () => {
    expect(
      resolveStopExit({
        reason: "skip_pressed",
        studentsActioned: 0,
        arrivedAt,
        now: new Date("2026-08-18T07:00:30Z"),
        minStopDwellSeconds: 90,
      })
    ).toBeNull();
  });
});

describe("resolveStopExit › left geofence", () => {
  const arrivedAt = new Date("2026-08-18T07:00:00Z");

  it("Given zero ticks and dwell below min, When the bus leaves, Then the stop stays unresolved", () => {
    expect(
      resolveStopExit({
        reason: "left_geofence",
        studentsActioned: 0,
        arrivedAt,
        now: new Date("2026-08-18T07:00:20Z"),
        minStopDwellSeconds: 90,
      })
    ).toBeNull();
  });

  it("Given zero ticks after min dwell, When the bus leaves, Then outcome is visited and remaining Pending become Absent", () => {
    const result = resolveStopExit({
      reason: "left_geofence",
      studentsActioned: 0,
      arrivedAt,
      now: new Date("2026-08-18T07:01:30Z"),
      minStopDwellSeconds: 90,
    });
    expect(result).toEqual({ outcome: "visited", alertAdmin: true, markRemainingAbsent: true });
  });

  it("Given at least one student actioned, When the bus leaves without Complete, Then outcome is completed without waiting", () => {
    const result = resolveStopExit({
      reason: "left_geofence",
      studentsActioned: 2,
      arrivedAt,
      now: new Date("2026-08-18T07:00:10Z"),
      minStopDwellSeconds: 90,
    });
    expect(result).toEqual({ outcome: "completed", alertAdmin: false, markRemainingAbsent: true });
  });
});

describe("clampMinStopDwellSeconds", () => {
  it("Given a value below 60, When clamped, Then it is 60", () => {
    expect(clampMinStopDwellSeconds(10)).toBe(60);
  });

  it("Given a value above 180, When clamped, Then it is 180", () => {
    expect(clampMinStopDwellSeconds(400)).toBe(180);
  });

  it("Given a missing value, When clamped, Then it is 90", () => {
    expect(clampMinStopDwellSeconds(undefined)).toBe(90);
  });
});

describe("dwellSeconds", () => {
  it("Given arrived and departed timestamps, When computed, Then returns elapsed seconds", () => {
    const arrived = new Date("2026-08-14T07:00:00Z");
    const departed = new Date("2026-08-14T07:02:15Z");
    expect(dwellSeconds(arrived, departed)).toBe(135);
  });

  it("Given no arrival, When computed, Then dwell is 0", () => {
    expect(dwellSeconds(null, new Date("2026-08-14T07:02:15Z"))).toBe(0);
  });
});

describe("shouldOverwriteOutcome", () => {
  it("Given existing visited, When completed arrives, Then overwrite is allowed", () => {
    expect(shouldOverwriteOutcome("visited", "completed")).toBe(true);
  });

  it("Given existing completed, When visited arrives, Then overwrite is refused", () => {
    expect(shouldOverwriteOutcome("completed", "visited")).toBe(false);
  });
});

describe("adminStopAlertMessage", () => {
  it("Given visited outcome, When formatted, Then message has stop and route names without student PII", () => {
    const msg = adminStopAlertMessage({
      outcome: "visited",
      stopName: "Westlands Gate",
      routeName: "Morning Route 1",
      vehiclePlate: "KBC 123X",
    });
    expect(msg).toContain("Westlands Gate");
    expect(msg).toContain("Morning Route 1");
    expect(msg).toContain("KBC 123X");
    expect(msg?.toLowerCase()).not.toMatch(/james|mwangi|\+254/);
  });

  it("Given completed outcome, When formatted, Then no admin alert message", () => {
    expect(
      adminStopAlertMessage({
        outcome: "completed",
        stopName: "Westlands Gate",
        routeName: "Morning Route 1",
      })
    ).toBeNull();
  });
});
