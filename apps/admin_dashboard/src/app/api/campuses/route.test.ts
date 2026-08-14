import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { GET } from "@/app/api/campuses/route";

describe("GET /api/campuses", () => {
  it("unconfigured supabase › returns mock school campuses", async () => {
    const res = await GET(new Request("http://localhost/api/campuses"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Array<{ name: string }> };
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0]?.name).toMatch(/academy|campus|school/i);
  });
});
