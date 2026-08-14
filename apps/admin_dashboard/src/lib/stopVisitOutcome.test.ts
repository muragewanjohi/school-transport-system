import { describe, expect, it } from "vitest";
import {
  adminStopAlertMessage,
  dwellSeconds,
  resolveStopExit,
  shouldOverwriteOutcome,
} from "@/lib/stopVisitOutcome";

describe("resolveStopExit › complete pressed", () => {
  it("Given Complete Stop, When resolved, Then outcome is completed without admin alert", () => {
    const result = resolveStopExit({ reason: "complete_pressed", studentsActioned: 0 });
    expect(result).toEqual({ outcome: "completed", alertAdmin: false });
  });
});

describe("resolveStopExit › skip pressed", () => {
  it("Given Skip Stop, When resolved, Then outcome is skipped and admins are alerted", () => {
    const result = resolveStopExit({ reason: "skip_pressed", studentsActioned: 0 });
    expect(result).toEqual({ outcome: "skipped", alertAdmin: true });
  });
});

describe("resolveStopExit › left geofence", () => {
  it("Given no students actioned, When the bus leaves, Then outcome is visited and admins are alerted", () => {
    const result = resolveStopExit({ reason: "left_geofence", studentsActioned: 0 });
    expect(result).toEqual({ outcome: "visited", alertAdmin: true });
  });

  it("Given at least one student actioned, When the bus leaves without Complete, Then outcome is completed without alert", () => {
    const result = resolveStopExit({ reason: "left_geofence", studentsActioned: 2 });
    expect(result).toEqual({ outcome: "completed", alertAdmin: false });
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
