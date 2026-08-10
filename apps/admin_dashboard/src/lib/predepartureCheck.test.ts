import { describe, expect, it } from "vitest";
import {
  alreadyPredepartureAlerted,
  DEFAULT_PREDEPARTURE_GRACE_MINUTES,
  resolveExpectedDepartureUtc,
  shouldMarkPredepartureDelayed,
  type PredepartureTripCandidate,
} from "@/lib/predepartureCheck";

function candidate(overrides: Partial<PredepartureTripCandidate> = {}): PredepartureTripCandidate {
  return {
    id: "t1",
    status: "scheduled",
    started_at: null,
    status_override: null,
    custom_departure_time: null,
    trip_date: "2026-08-10",
    departure_time: "08:00:00",
    ...overrides,
  };
}

describe("resolveExpectedDepartureUtc › Africa/Nairobi wall time", () => {
  it("Given 08:00 EAT, When resolved, Then equals 05:00 UTC", () => {
    const d = resolveExpectedDepartureUtc("2026-08-10", "08:00:00");
    expect(d?.toISOString()).toBe("2026-08-10T05:00:00.000Z");
  });
});

describe("shouldMarkPredepartureDelayed", () => {
  const departureUtc = new Date("2026-08-10T05:00:00.000Z"); // 08:00 EAT

  it("Given trip still inside grace, When checked, Then not marked", () => {
    const now = new Date(departureUtc.getTime() + 3 * 60 * 1000);
    expect(shouldMarkPredepartureDelayed(candidate(), now, DEFAULT_PREDEPARTURE_GRACE_MINUTES)).toBe(
      false
    );
  });

  it("Given trip past grace with no start, When checked, Then marked", () => {
    const now = new Date(departureUtc.getTime() + 15 * 60 * 1000);
    expect(shouldMarkPredepartureDelayed(candidate(), now, DEFAULT_PREDEPARTURE_GRACE_MINUTES)).toBe(
      true
    );
  });

  it("Given status_override already Delayed, When checked, Then skipped", () => {
    const now = new Date(departureUtc.getTime() + 15 * 60 * 1000);
    expect(
      shouldMarkPredepartureDelayed(
        candidate({ status_override: "Delayed" }),
        now,
        DEFAULT_PREDEPARTURE_GRACE_MINUTES
      )
    ).toBe(false);
    expect(alreadyPredepartureAlerted("Route delayed")).toBe(true);
  });

  it("Given in_progress trip, When checked, Then skipped", () => {
    const now = new Date(departureUtc.getTime() + 15 * 60 * 1000);
    expect(
      shouldMarkPredepartureDelayed(
        candidate({ status: "in_progress", started_at: now.toISOString() }),
        now
      )
    ).toBe(false);
  });

  it("Given custom_departure_time later than schedule, When checked before that grace, Then skipped", () => {
    // Schedule 08:00, custom 09:00 EAT (= 06:00 UTC). At 08:20 EAT still inside custom grace.
    const now = new Date("2026-08-10T05:20:00.000Z");
    expect(
      shouldMarkPredepartureDelayed(
        candidate({ custom_departure_time: "09:00:00" }),
        now,
        DEFAULT_PREDEPARTURE_GRACE_MINUTES
      )
    ).toBe(false);
  });
});
