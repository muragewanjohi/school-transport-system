import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { PUT } from "@/app/api/stops/[id]/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/stops/stop-1-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/stops/[id]", () => {
  it("valid name and coordinates › returns 200", async () => {
    const res = await PUT(
      jsonRequest({
        name: "Stop Riverside Updated",
        latitude: -1.2669659,
        longitude: 36.8095462,
        sequence_no: 1,
        geofence_radius_meters: 50,
      }),
      { params: Promise.resolve({ id: "stop-1-1" }) }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { name: string } };
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Stop Riverside Updated");
  });

  it("empty name › returns 400", async () => {
    const res = await PUT(jsonRequest({ name: "" }), {
      params: Promise.resolve({ id: "stop-1-1" }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
