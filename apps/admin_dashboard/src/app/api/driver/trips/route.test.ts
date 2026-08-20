import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { GET } from "@/app/api/driver/trips/route";

describe("GET /api/driver/trips › campus boarding counts", () => {
  it("mock trips › include pending_count and boarded_count", async () => {
    const res = await GET(new Request("http://localhost/api/driver/trips?vehicle_id=veh-1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ pending_count?: number; boarded_count?: number; absent_count?: number }>;
    };
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    for (const trip of json.data) {
      expect(typeof trip.pending_count).toBe("number");
      expect(typeof trip.boarded_count).toBe("number");
      expect(typeof trip.absent_count).toBe("number");
    }
  });
});
