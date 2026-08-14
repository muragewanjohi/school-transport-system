import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { PUT } from "@/app/api/routes/[id]/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/routes/route-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/routes/[id]", () => {
  it("valid name and coordinates › returns 200", async () => {
    const res = await PUT(
      jsonRequest({
        name: "Updated Route",
        schoolStart: { name: "Campus Gate", latitude: -1.29, longitude: 36.82 },
        schoolEnd: { name: "Campus Gate", latitude: -1.29, longitude: 36.82 },
      }),
      { params: Promise.resolve({ id: "route-1" }) }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { name: string } };
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Updated Route");
  });

  it("empty name › returns 400", async () => {
    const res = await PUT(jsonRequest({ name: "" }), {
      params: Promise.resolve({ id: "route-1" }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
