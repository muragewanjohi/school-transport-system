import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/authApi", () => ({
  getCallerProfile: vi.fn().mockResolvedValue(null),
  isDemoReadonly: vi.fn().mockReturnValue(false),
  demoReadonlyForbiddenResponse: vi.fn(),
}));

import { POST } from "@/app/api/stops/attach/route";

describe("POST /api/stops/attach", () => {
  it("valid stop ids › returns 200 and attached count", async () => {
    const res = await POST(
      new Request("http://localhost/api/stops/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: "route-b",
          stop_ids: ["a1", "a2"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { attached: number } };
    expect(json.success).toBe(true);
    expect(json.data.attached).toBe(2);
  });

  it("missing stop_ids › returns 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/stops/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_id: "route-b" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
