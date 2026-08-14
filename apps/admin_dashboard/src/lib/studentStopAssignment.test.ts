import { describe, expect, it } from "vitest";
import {
  assignmentForNewRoute,
  defaultDifferentStopIds,
  defaultSameStopId,
  inferStudentStopMode,
  sameStageIds,
} from "@/lib/studentStopAssignment";

describe("inferStudentStopMode", () => {
  it("same pickup and drop-off › mode is same", () => {
    expect(inferStudentStopMode("stop-1", "stop-1")).toBe("same");
    expect(sameStageIds("stop-1")).toEqual({
      pickup_stop_id: "stop-1",
      dropoff_stop_id: "stop-1",
    });
  });

  it("different stops › mode is different", () => {
    expect(inferStudentStopMode("stop-1", "stop-2")).toBe("different");
  });

  it("empty both › defaults to same", () => {
    expect(inferStudentStopMode("", "")).toBe("same");
  });
});

describe("default stop ids", () => {
  const stops = [
    { id: "a", stop_type: "PICKUP" },
    { id: "b", stop_type: "DROPOFF" },
  ];

  it("same mode › one shared stage", () => {
    expect(defaultSameStopId(stops)).toBe("a");
  });

  it("different mode › pickup and drop-off types", () => {
    expect(defaultDifferentStopIds(stops)).toEqual({
      pickup_stop_id: "a",
      dropoff_stop_id: "b",
    });
  });
});

describe("assignmentForNewRoute", () => {
  it("changing route › remaps stops and clears trips", () => {
    expect(
      assignmentForNewRoute("old-pu", "old-do", [
        { id: "a", stop_type: "PICKUP" },
        { id: "b", stop_type: "DROPOFF" },
      ])
    ).toEqual({
      pickup_stop_id: "a",
      dropoff_stop_id: "b",
      schedule_ids: [],
    });
  });
});
