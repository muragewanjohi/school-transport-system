import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/driverSession", () => ({
  resolveRequestDb: vi.fn(),
}));

import { POST } from "@/app/api/stops/route";

const validStop = {
  route_id: "route-1",
  name: "Stop Riverside",
  latitude: -1.2669659,
  longitude: 36.8095462,
  sequence_no: 1,
  geofence_radius_meters: 50,
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/stops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stops", () => {
  it("valid payload › returns 200 and persists stop coordinates", async () => {
    const res = await POST(jsonRequest(validStop));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { name: string; stop_type: string; location: { coordinates: [number, number] } };
    };
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Stop Riverside");
    expect(json.data.location.coordinates[0]).toBe(validStop.longitude);
    expect(json.data.location.coordinates[1]).toBe(validStop.latitude);
    expect(json.data.stop_type).toBe("BOTH");
  });

  it("missing name › returns 400", async () => {
    const res = await POST(
      jsonRequest({
        ...validStop,
        name: "",
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
