import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/routes/route";

const validSchool = {
  name: "St Marys Academy",
  latitude: -1.2921,
  longitude: 36.8219,
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/routes", () => {
  it("valid payload › returns 200 and persists route with school coordinates", async () => {
    const res = await POST(
      jsonRequest({
        name: "Morning Route 1",
        schoolStart: validSchool,
        schoolEnd: validSchool,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { route: { name: string }; schoolStops: Array<{ name: string }> };
    };
    expect(json.success).toBe(true);
    expect(json.data.route.name).toBe("Morning Route 1");
    expect(json.data.schoolStops.length).toBeGreaterThanOrEqual(1);
  });

  it("missing schoolStart › returns 400", async () => {
    const res = await POST(
      jsonRequest({
        name: "Morning Route 1",
        schoolEnd: validSchool,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
