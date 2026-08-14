import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/schedules/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validSchedule = {
  route_id: "route-1",
  name: "Early AM Run",
  departure_time: "07:00:00",
  direction: "HOME_TO_SCHOOL",
  target_grades: ["Grade 1"],
  days_of_week: [1, 2, 3, 4, 5],
};

describe("POST /api/schedules", () => {
  it("missing target_grades › returns 400 with field errors", async () => {
    const res = await POST(
      jsonRequest({
        ...validSchedule,
        target_grades: [],
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      success: boolean;
      errors?: Record<string, string[]>;
    };
    expect(json.success).toBe(false);
    expect(json.errors?.target_grades?.length).toBeGreaterThan(0);
  });

  it("valid payload › returns 200", async () => {
    const res = await POST(jsonRequest(validSchedule));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });
});
