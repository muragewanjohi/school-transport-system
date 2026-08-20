import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { PUT } from "@/app/api/trips/route";
import { DROPOFF_START_BLOCKED_MESSAGE } from "@/lib/dropoffCampusBoarding";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/trips", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/trips › drop-off campus boarding", () => {
  it("SCHOOL_TO_HOME with pending manifests › returns 409 and does not start", async () => {
    const res = await PUT(
      jsonRequest({
        trip_id: "trip-dropoff",
        status: "in_progress",
      })
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe(DROPOFF_START_BLOCKED_MESSAGE);
  });

  it("SCHOOL_TO_HOME with boarded and absent › returns 200", async () => {
    const res = await PUT(
      jsonRequest({
        trip_id: "trip-dropoff-ready",
        status: "in_progress",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });

  it("HOME_TO_SCHOOL with pending manifests › returns 200", async () => {
    const res = await PUT(
      jsonRequest({
        trip_id: "trip-1",
        status: "in_progress",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });

  it("finalize_campus_boarding › marks remaining pending absent", async () => {
    const res = await PUT(
      jsonRequest({
        trip_id: "trip-dropoff",
        finalize_campus_boarding: true,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ attendance: string }>;
    };
    expect(json.success).toBe(true);
    expect(json.data.every((row) => row.attendance !== "pending")).toBe(true);
    expect(json.data.some((row) => row.attendance === "absent")).toBe(true);
  });

  it("trip_id only without a patch › returns 400 not Trip not found", async () => {
    const res = await PUT(jsonRequest({ trip_id: "trip-dropoff" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe("Nothing to update");
    expect(json.error).not.toBe("Trip not found");
  });

  it("invalid status › returns 400", async () => {
    const res = await PUT(jsonRequest({ trip_id: "trip-1", status: "running" }));
    expect(res.status).toBe(400);
  });

  it("complete trip › returns duration_seconds", async () => {
    const res = await PUT(jsonRequest({ trip_id: "trip-1", status: "completed" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { duration_seconds?: number };
    };
    expect(json.success).toBe(true);
    expect(typeof json.data.duration_seconds).toBe("number");
    expect(json.data.duration_seconds).toBeGreaterThanOrEqual(0);
  });
});
