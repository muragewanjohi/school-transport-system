import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/driver/school-arrival/route";
import { MOCK_SCHOOL_ARRIVAL, SCHOOL_ARRIVAL_ERRORS } from "@/lib/schoolArrival";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/driver/school-arrival", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/driver/school-arrival", () => {
  it("missing trip_id › returns 400 with field errors", async () => {
    const res = await POST(jsonRequest({ stop_id: MOCK_SCHOOL_ARRIVAL.pickupInProgress.lastStopId }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; errors?: Record<string, string[]> };
    expect(json.success).toBe(false);
    expect(json.errors?.trip_id?.length).toBeGreaterThan(0);
  });

  it("pickup not last stop › returns 409", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: MOCK_SCHOOL_ARRIVAL.pickupInProgress.tripId,
        stop_id: MOCK_SCHOOL_ARRIVAL.pickupInProgress.midStopId,
      })
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe(SCHOOL_ARRIVAL_ERRORS.not_last_stop);
  });

  it("drop-off trip › returns 409", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: MOCK_SCHOOL_ARRIVAL.dropoffInProgress.tripId,
        stop_id: MOCK_SCHOOL_ARRIVAL.dropoffInProgress.lastStopId,
      })
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe(SCHOOL_ARRIVAL_ERRORS.not_pickup);
  });

  it("pickup last stop › returns 200 boarded→dropped_off + duration_seconds", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: MOCK_SCHOOL_ARRIVAL.pickupInProgress.tripId,
        stop_id: MOCK_SCHOOL_ARRIVAL.pickupInProgress.lastStopId,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { status: string; duration_seconds: number; dropped_off_count: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("completed");
    expect(json.data.duration_seconds).toBeGreaterThan(0);
    expect(json.data.dropped_off_count).toBe(2);
  });

  it("already completed › returns 200 idempotent", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: MOCK_SCHOOL_ARRIVAL.pickupCompleted.tripId,
        stop_id: MOCK_SCHOOL_ARRIVAL.pickupCompleted.lastStopId,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      idempotent?: boolean;
      data: { duration_seconds: number; dropped_off_count: number };
    };
    expect(json.success).toBe(true);
    expect(json.idempotent).toBe(true);
    expect(json.data.duration_seconds).toBe(1920);
    expect(json.data.dropped_off_count).toBe(0);
  });
});
