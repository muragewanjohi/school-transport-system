import { describe, expect, it } from "vitest";
import {
  childStopIdForDirection,
  departureMinutesFromMidnight,
  estimateParentTripDurationMinutes,
  etaMinutesFromPredictedArrival,
  formatParentDepartureDisplay,
  isInProgressTrip,
  nestedBusNumber,
  nestedName,
  nestedPlate,
  parentChildStatusFromSources,
  parentCrewContactFromProfile,
  parseLiveCoordinates,
  pickEarliestNextTrip,
  scheduleRunsOnWeekday,
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
        tripActive: true,
      })
    ).toBe("On the Bus");
    expect(
      parentChildStatusFromSources({
        attendance: "pending",
        transitStatus: "pending",
        direction: "SCHOOL_TO_HOME",
        tripActive: true,
      })
    ).toBe("At school");
  });

  it("parentChildStatusFromSources › idle never On the Bus even with boarded roster", () => {
    expect(
      parentChildStatusFromSources({
        attendance: "boarded",
        transitStatus: "On the Bus",
        direction: "HOME_TO_SCHOOL",
        tripActive: false,
      })
    ).toBe("Waiting for pickup");
    expect(
      parentChildStatusFromSources({
        transitStatus: "On the Bus",
        direction: "SCHOOL_TO_HOME",
        tripActive: false,
      })
    ).toBe("At school");
  });

  it("pickEarliestNextTrip › chooses earliest departure today", () => {
    expect(
      pickEarliestNextTrip([
        {
          departure_time: "15:30",
          direction: "SCHOOL_TO_HOME",
          schedule_name: "PM",
          vehicle_plate: "KDD 999Z",
          bus_number: "2",
          estimated_duration_minutes: 40,
        },
        {
          departure_time: "06:45:00",
          custom_departure_time: null,
          direction: "HOME_TO_SCHOOL",
          schedule_name: "AM",
          vehicle_plate: "KDD 123A",
          bus_number: "1",
          estimated_duration_minutes: 35,
        },
      ])
    ).toEqual({
      departure_time: "06:45",
      direction: "HOME_TO_SCHOOL",
      schedule_name: "AM",
      vehicle_plate: "KDD 123A",
      bus_number: "1",
      estimated_duration_minutes: 35,
    });
  });

  it("formatParentDepartureDisplay › prefers custom delay clock", () => {
    expect(formatParentDepartureDisplay("07:10", "06:45")).toBe("07:10");
    expect(formatParentDepartureDisplay(null, "6:05:00")).toBe("06:05");
    expect(departureMinutesFromMidnight("06:45")).toBe(6 * 60 + 45);
  });

  it("scheduleRunsOnWeekday › empty means every day", () => {
    expect(scheduleRunsOnWeekday(null, 1)).toBe(true);
    expect(scheduleRunsOnWeekday([1, 2, 3, 4, 5], 0)).toBe(false);
    expect(scheduleRunsOnWeekday([1, 2, 3, 4, 5], 1)).toBe(true);
  });

  it("estimateParentTripDurationMinutes › matches driver heuristic", () => {
    expect(estimateParentTripDurationMinutes({ stopCount: 5, studentCount: 10 })).toBe(
      5 * 4 + 15 + 10
    );
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
    expect(nestedBusNumber({ bus_number: "12" })).toBe("12");
  });

  it("parentCrewContactFromProfile › maps name phone avatar", () => {
    expect(
      parentCrewContactFromProfile({
        name: "Jane Driver",
        phone: "+254700000001",
        avatar_url: "https://cdn/a.jpg",
      })
    ).toEqual({
      name: "Jane Driver",
      phone: "+254700000001",
      avatar_url: "https://cdn/a.jpg",
    });
    expect(parentCrewContactFromProfile(null)).toBeNull();
  });
});
