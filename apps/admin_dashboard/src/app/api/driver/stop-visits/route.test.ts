import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/driver/stop-visits/route";

const UUID = {
  trip: "11111111-1111-4111-8111-111111111111",
  stop: "22222222-2222-4222-8222-222222222222",
  route: "33333333-3333-4333-8333-333333333333",
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/driver/stop-visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/driver/stop-visits", () => {
  it("missing trip_id › returns 400 with field errors", async () => {
    const res = await POST(
      jsonRequest({
        stop_id: UUID.stop,
        outcome: "visited",
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; errors?: Record<string, string[]> };
    expect(json.success).toBe(false);
    expect(json.errors?.trip_id?.length).toBeGreaterThan(0);
  });

  it("invalid outcome › returns 400", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: UUID.trip,
        stop_id: UUID.stop,
        outcome: "unknown",
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it("valid visited payload › returns 200 and marks alerted", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: UUID.trip,
        stop_id: UUID.stop,
        route_id: UUID.route,
        outcome: "visited",
        arrived_at: "2026-08-14T07:00:00.000Z",
        departed_at: "2026-08-14T07:01:30.000Z",
        students_actioned: 0,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { outcome: string; alerted: boolean; dwell_seconds: number } };
    expect(json.success).toBe(true);
    expect(json.data.outcome).toBe("visited");
    expect(json.data.alerted).toBe(true);
    expect(json.data.dwell_seconds).toBe(90);
  });

  it("visited before min dwell › returns 409", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: UUID.trip,
        stop_id: UUID.stop,
        outcome: "visited",
        arrived_at: "2026-08-14T07:00:00.000Z",
        departed_at: "2026-08-14T07:00:20.000Z",
        students_actioned: 0,
      })
    );
    expect(res.status).toBe(409);
  });

  it("valid skipped payload › returns 200 and marks alerted", async () => {
    const res = await POST(
      jsonRequest({
        trip_id: UUID.trip,
        stop_id: UUID.stop,
        outcome: "skipped",
        arrived_at: "2026-08-14T07:00:00.000Z",
        departed_at: "2026-08-14T07:01:30.000Z",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { outcome: string; alerted: boolean } };
    expect(json.success).toBe(true);
    expect(json.data.outcome).toBe("skipped");
    expect(json.data.alerted).toBe(true);
  });
});
