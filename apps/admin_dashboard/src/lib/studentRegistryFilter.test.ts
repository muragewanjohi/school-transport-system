import { describe, expect, it } from "vitest";
import {
  mergeStudentTripIds,
  studentMatchesRegistrySearch,
  studentMatchesRouteFilter,
  studentMatchesTripFilter,
} from "@/lib/studentRegistryFilter";

describe("studentMatchesTripFilter", () => {
  it("All › every student matches", () => {
    expect(studentMatchesTripFilter(["sched-1"], "All")).toBe(true);
    expect(studentMatchesTripFilter([], "All")).toBe(true);
  });

  it("none › only students with no trip", () => {
    expect(studentMatchesTripFilter([], "none")).toBe(true);
    expect(studentMatchesTripFilter(["sched-1"], "none")).toBe(false);
  });

  it("specific trip › only students with that schedule id", () => {
    expect(studentMatchesTripFilter(["sched-1", "sched-2"], "sched-2")).toBe(true);
    expect(studentMatchesTripFilter(["sched-1"], "sched-9")).toBe(false);
  });
});

describe("studentMatchesRouteFilter", () => {
  it("specific route › only students on that route", () => {
    expect(studentMatchesRouteFilter("route-1", "All")).toBe(true);
    expect(studentMatchesRouteFilter("route-1", "route-1")).toBe(true);
    expect(studentMatchesRouteFilter("route-2", "route-1")).toBe(false);
    expect(studentMatchesRouteFilter("", "none")).toBe(true);
    expect(studentMatchesRouteFilter("route-1", "none")).toBe(false);
  });
});

describe("mergeStudentTripIds", () => {
  it("changing pick-up keeps drop-off", () => {
    expect(
      mergeStudentTripIds({
        currentIds: ["pu-1", "do-1"],
        pickupScheduleIds: ["pu-1", "pu-2"],
        dropoffScheduleIds: ["do-1"],
        slot: "pickup",
        selectedId: "pu-2",
      })
    ).toEqual(["pu-2", "do-1"]);
  });
});

describe("studentMatchesRegistrySearch", () => {
  it("matches trip name in search", () => {
    expect(
      studentMatchesRegistrySearch({
        name: "Liam",
        routeName: "Route 1",
        pickupName: "Stage A",
        dropoffName: "Stage B",
        nfc: null,
        grade: "Grade 4",
        className: "4 Blue",
        tripNames: ["Early AM Run"],
        guardians: [],
        query: "early am",
      })
    ).toBe(true);
  });
});
