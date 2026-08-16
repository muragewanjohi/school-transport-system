import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/students/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseStudent = {
  name: "Amina Wanjiku",
  route_id: "route-1",
  pickup_stop_id: "stop-1",
  dropoff_stop_id: "stop-1",
  schedule_ids: [],
  status: "Present",
};

describe("POST /api/students", () => {
  it("two guardians share a phone › returns 400 and does not persist", async () => {
    const res = await POST(
      jsonRequest({
        ...baseStudent,
        guardians: [
          { name: "Jane Wanjiku", phone: "+254700111222" },
          { name: "Jane Copy", phone: "+254 700 111 222" },
        ],
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      success: boolean;
      errors?: { guardians?: string[] };
    };
    expect(json.success).toBe(false);
    expect(json.errors?.guardians?.[0]).toBe(
      "Two guardians cannot share the same phone number."
    );
  });
});
