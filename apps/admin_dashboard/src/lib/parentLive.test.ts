import { describe, expect, it } from "vitest";
import {
  childStopIdForDirection,
  isInProgressTrip,
  nestedName,
  nestedPlate,
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

  it("nested helpers › read plate and name", () => {
    expect(nestedPlate({ license_plate: "KDD 123A" })).toBe("KDD 123A");
    expect(nestedName({ name: "Jane Driver" })).toBe("Jane Driver");
  });
});
