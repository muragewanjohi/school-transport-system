import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { GET } from "@/app/api/alerts/route";

describe("GET /api/alerts", () => {
  it("unconfigured database › returns empty mock list", async () => {
    const res = await GET(new Request("http://localhost/api/alerts"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });
});
