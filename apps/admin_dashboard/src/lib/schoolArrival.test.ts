import { describe, expect, it } from "vitest";
import {
  decideSchoolArrival,
  durationSecondsFromRange,
  isSchoolDestinationStop,
  isSchoolOriginStop,
  lastSequencedStopId,
  PICKUP_DIRECTION,
  DROPOFF_DIRECTION,
  schoolArrivalRejectReason,
} from "@/lib/schoolArrival";

const stops = [
  { id: "school", sequence_no: 1 },
  { id: "home-1", sequence_no: 2 },
  { id: "home-2", sequence_no: 3 },
];

const pickupStops = [
  { id: "home-1", sequence_no: 1 },
  { id: "home-2", sequence_no: 2 },
  { id: "school", sequence_no: 3 },
];

describe("durationSecondsFromRange", () => {
  it("started_at to completed_at › returns whole seconds", () => {
    expect(durationSecondsFromRange("2026-08-20T07:00:00.000Z", "2026-08-20T07:32:00.000Z")).toBe(1920);
  });

  it("missing started_at › returns 0", () => {
    expect(durationSecondsFromRange(null, "2026-08-20T07:32:00.000Z")).toBe(0);
  });
});

describe("school terminal helpers", () => {
  it("drop-off first stop › is school origin", () => {
    expect(
      isSchoolOriginStop({ stopId: "school", stops, direction: DROPOFF_DIRECTION })
    ).toBe(true);
    expect(
      isSchoolOriginStop({ stopId: "home-1", stops, direction: DROPOFF_DIRECTION })
    ).toBe(false);
  });

  it("pickup last stop › is school destination", () => {
    expect(
      isSchoolDestinationStop({
        stopId: "school",
        stops: pickupStops,
        direction: PICKUP_DIRECTION,
      })
    ).toBe(true);
    expect(lastSequencedStopId(pickupStops)).toBe("school");
  });
});

describe("decideSchoolArrival", () => {
  it("completed trip › is idempotent with stored duration", () => {
    expect(
      decideSchoolArrival({
        status: "completed",
        direction: PICKUP_DIRECTION,
        stopId: "school",
        lastStopId: "school",
        durationSeconds: 1920,
      })
    ).toEqual({ kind: "idempotent", durationSeconds: 1920 });
  });

  it("drop-off trip › rejects", () => {
    expect(
      schoolArrivalRejectReason({
        status: "in_progress",
        direction: DROPOFF_DIRECTION,
        stopId: "school",
        lastStopId: "school",
      })
    ).toBe("not_pickup");
  });

  it("pickup not last stop › rejects", () => {
    expect(
      schoolArrivalRejectReason({
        status: "in_progress",
        direction: PICKUP_DIRECTION,
        stopId: "home-2",
        lastStopId: "school",
      })
    ).toBe("not_last_stop");
  });

  it("pickup last stop in progress › accepts", () => {
    expect(
      decideSchoolArrival({
        status: "in_progress",
        direction: PICKUP_DIRECTION,
        stopId: "school",
        lastStopId: "school",
      })
    ).toEqual({ kind: "accept" });
  });
});
