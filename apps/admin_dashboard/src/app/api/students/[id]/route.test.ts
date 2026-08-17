import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

const { saveLocalStudents } = vi.hoisted(() => ({
  saveLocalStudents: vi.fn(),
}));

vi.mock("@/lib/jsonDb", () => ({
  getLocalStudents: () => [
    {
      id: "std-1",
      name: "Liam Mwangi",
      route_id: "route-1",
      pickup_stop_id: "stop-1",
      dropoff_stop_id: "stop-1",
      guardians: [{ name: "James Mwangi", phone: "+254700111222" }],
    },
  ],
  saveLocalStudents,
}));

import { PUT } from "@/app/api/students/[id]/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/students/std-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "std-1" }) };

describe("PUT /api/students/:id", () => {
  it("two guardians share a phone › returns 400 and does not persist", async () => {
    saveLocalStudents.mockClear();
    const res = await PUT(
      jsonRequest({
        guardians: [
          { name: "Jane Wanjiku", phone: "+254700111222" },
          { name: "Jane Copy", phone: "+254 700 111 222" },
        ],
      }),
      params
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
    expect(saveLocalStudents).not.toHaveBeenCalled();
  });

  it("valid name and home pin › persists pickup_location without latitude columns", async () => {
    saveLocalStudents.mockClear();
    const res = await PUT(
      jsonRequest({
        name: "Amina Wanjiku",
        address: "Westlands, Nairobi",
        latitude: -1.2,
        longitude: 36.8,
      }),
      params
    );
    expect(res.status).toBe(200);
    expect(saveLocalStudents).toHaveBeenCalledTimes(1);
    const saved = saveLocalStudents.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(saved[0].name).toBe("Amina Wanjiku");
    expect(saved[0].pickup_location).toBe("POINT(36.8 -1.2)");
    expect(saved[0]).not.toHaveProperty("latitude");
    expect(saved[0]).not.toHaveProperty("longitude");
  });
});
