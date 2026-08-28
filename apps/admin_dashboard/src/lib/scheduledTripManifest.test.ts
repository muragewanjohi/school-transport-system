import { describe, expect, it } from "vitest";
import {
  scheduledManifestSyncPlan,
  utcTripDate,
} from "@/lib/scheduledTripManifest";

describe("scheduledManifestSyncPlan › live roster vs snapped manifests", () => {
  it("registry gained students after snap › adds missing and drops unassigned", () => {
    const plan = scheduledManifestSyncPlan({
      assignedStudentIds: ["ryan", "reuel", "amina"],
      existingStudentIds: ["elena", "reuel"],
    });
    expect(plan.addStudentIds).toEqual(["ryan", "amina"]);
    expect(plan.removeStudentIds).toEqual(["elena"]);
  });

  it("already aligned roster › makes no changes", () => {
    expect(
      scheduledManifestSyncPlan({
        assignedStudentIds: ["ryan", "reuel", "amina"],
        existingStudentIds: ["ryan", "reuel", "amina"],
      })
    ).toEqual({ addStudentIds: [], removeStudentIds: [] });
  });

  it("empty schedule assignment › removes leftover snap rows", () => {
    expect(
      scheduledManifestSyncPlan({
        assignedStudentIds: [],
        existingStudentIds: ["elena"],
      })
    ).toEqual({ addStudentIds: [], removeStudentIds: ["elena"] });
  });
});

describe("utcTripDate", () => {
  it("uses the UTC calendar date", () => {
    expect(utcTripDate(new Date("2026-08-28T07:41:36.617Z"))).toBe("2026-08-28");
  });
});
