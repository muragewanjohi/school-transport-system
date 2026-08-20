import { describe, expect, it } from "vitest";
import {
  childStopIdForDirection,
  etaMinutesFromPredictedArrival,
  isInProgressTrip,
  nestedName,
  nestedPlate,
  parentChildStatusFromSources,
  parseLiveCoordinates,
} from "@/lib/parentLive";

describe("parentLive", () => {
  it("parseLiveCoordinates › WKT point › returns lat/lng", () => {
    expect(parseLiveCoordinates("POINT(36.8 -1.27)")).toEqual({ lat: -1.27, lng: 36.8 });
  });

  it("parseLiveCoordinates › GeoJSON › returns lat/lng", () => {
    expect(parseLiveCoordinates({ type: "Point", coordinates: [36.81, -1.28] })).toEqual({
      lat: -1.28,
      lng: 36.81,
    });
  });

  it("parseLiveCoordinates › PostGIS EWKB hex › returns lat/lng", () => {
    // POINT(-122.084 37.4219983) little-endian Point+SRID
    expect(
      parseLiveCoordinates("0101000020E61000004C37894160855EC0DABB500A04B64240")
    ).toEqual({
      lat: expect.closeTo(37.4219983, 0.000001),
      lng: expect.closeTo(-122.084, 0.000001),
    });
  });

  it("childStopIdForDirection › pickup vs dropoff by run", () => {
    expect(childStopIdForDirection("HOME_TO_SCHOOL", "pick", "drop")).toBe("pick");
    expect(childStopIdForDirection("SCHOOL_TO_HOME", "pick", "drop")).toBe("drop");
  });

  it("isInProgressTrip › only in_progress is live", () => {
    expect(isInProgressTrip("in_progress")).toBe(true);
    expect(isInProgressTrip("scheduled")).toBe(false);
    expect(isInProgressTrip("completed")).toBe(false);
  });

  it("parentChildStatusFromSources › prefers manifest attendance over pending transit", () => {
    expect(
      parentChildStatusFromSources({
        attendance: "boarded",
        transitStatus: "pending",
        direction: "SCHOOL_TO_HOME",
      })
    ).toBe("On the Bus");
    expect(
      parentChildStatusFromSources({
        attendance: "pending",
        transitStatus: "pending",
        direction: "SCHOOL_TO_HOME",
      })
    ).toBe("At school");
  });

  it("etaMinutesFromPredictedArrival › rejects stale past predictions", () => {
    const now = new Date("2026-08-20T15:00:00Z");
    expect(etaMinutesFromPredictedArrival("2026-08-20T03:43:00Z", now)).toBeNull();
    expect(etaMinutesFromPredictedArrival("2026-08-20T15:08:00Z", now)).toBe(8);
    expect(etaMinutesFromPredictedArrival("2026-08-20T14:59:30Z", now)).toBe(0);
  });

  it("nested helpers › read plate and name", () => {
    expect(nestedPlate({ license_plate: "KDD 123A" })).toBe("KDD 123A");
    expect(nestedName({ name: "Jane Driver" })).toBe("Jane Driver");
  });
});
