import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { GET } from "@/app/api/billing/route";

describe("GET /api/billing", () => {
  it("unconfigured supabase › returns mock students, buses, and locations", async () => {
    const res = await GET(new Request("http://localhost/api/billing"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        students_count: number;
        buses_count: number;
        active_campus_count: number;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data.students_count).toBe(214);
    expect(json.data.buses_count).toBe(5);
    expect(json.data.active_campus_count).toBe(1);
  });
});
