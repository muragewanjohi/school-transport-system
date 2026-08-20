import { describe, expect, it } from "vitest";
import {
  DROPOFF_START_BLOCKED_MESSAGE,
  dropoffTripReadyToStart,
  isDropoffDirection,
  isManifestResolved,
  shouldBlockDropoffStart,
  tallyManifestAttendance,
} from "@/lib/dropoffCampusBoarding";

describe("dropoffTripReadyToStart", () => {
  it("empty roster › is ready to start", () => {
    expect(dropoffTripReadyToStart([])).toBe(true);
  });

  it("all boarded or absent › is ready to start", () => {
    expect(
      dropoffTripReadyToStart([
        { attendance: "boarded" },
        { attendance: "absent" },
        { attendance: "no_show" },
      ])
    ).toBe(true);
  });

  it("any pending row › is not ready", () => {
    expect(
      dropoffTripReadyToStart([{ attendance: "boarded" }, { attendance: "pending" }])
    ).toBe(false);
  });

  it("missing attendance › treated as pending", () => {
    expect(dropoffTripReadyToStart([{}])).toBe(false);
    expect(isManifestResolved(undefined)).toBe(false);
  });
});

describe("shouldBlockDropoffStart", () => {
  it("SCHOOL_TO_HOME with pending › blocks start", () => {
    expect(
      shouldBlockDropoffStart({
        direction: "SCHOOL_TO_HOME",
        manifests: [{ attendance: "pending" }],
      })
    ).toBe(true);
  });

  it("SCHOOL_TO_HOME with resolved roster › does not block", () => {
    expect(
      shouldBlockDropoffStart({
        direction: "SCHOOL_TO_HOME",
        manifests: [{ attendance: "boarded" }],
      })
    ).toBe(false);
  });

  it("HOME_TO_SCHOOL with pending › does not block", () => {
    expect(
      shouldBlockDropoffStart({
        direction: "HOME_TO_SCHOOL",
        manifests: [{ attendance: "pending" }],
      })
    ).toBe(false);
  });

  it("isDropoffDirection only matches SCHOOL_TO_HOME", () => {
    expect(isDropoffDirection("SCHOOL_TO_HOME")).toBe(true);
    expect(isDropoffDirection("HOME_TO_SCHOOL")).toBe(false);
  });
});

describe("tallyManifestAttendance", () => {
  it("counts pending boarded and absent", () => {
    expect(
      tallyManifestAttendance([
        { attendance: "boarded" },
        { attendance: "boarded" },
        { attendance: "absent" },
        { attendance: "no_show" },
        { attendance: "pending" },
      ])
    ).toEqual({
      students_count: 5,
      pending_count: 1,
      boarded_count: 2,
      absent_count: 2,
    });
  });
});

describe("DROPOFF_START_BLOCKED_MESSAGE", () => {
  it("tells the driver to board or mark absent first", () => {
    expect(DROPOFF_START_BLOCKED_MESSAGE).toContain("Board or mark absent");
  });
});
