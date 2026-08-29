import { describe, expect, it } from "vitest";
import {
  canOverrideTodayTripStatus,
  studentAssignedToTripSchedule,
} from "@/lib/todayTripOverride";

describe("Today's Trips status override", () => {
  it("Given a completed trip, When override is checked, Then it is blocked", () => {
    expect(canOverrideTodayTripStatus({ displayStatus: "Completed", tripStatus: "completed" })).toBe(
      false
    );
    expect(canOverrideTodayTripStatus({ displayStatus: "Active", tripStatus: "completed" })).toBe(false);
  });

  it("Given an active trip run, When override is checked, Then it is allowed", () => {
    expect(canOverrideTodayTripStatus({ displayStatus: "Active", tripStatus: "in_progress" })).toBe(true);
    expect(canOverrideTodayTripStatus({ displayStatus: "Scheduled", tripStatus: "scheduled" })).toBe(true);
  });

  it("Given two runs on the same route, When matching students, Then only the trip schedule is included", () => {
    const pickup = "sched-am";
    const dropoff = "sched-pm";
    expect(studentAssignedToTripSchedule([pickup], pickup)).toBe(true);
    expect(studentAssignedToTripSchedule([pickup], dropoff)).toBe(false);
    expect(studentAssignedToTripSchedule([pickup, dropoff], dropoff)).toBe(true);
  });
});
