import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/drivers/route";
import { PUT } from "@/app/api/drivers/[id]/route";

const driverBody = {
  name: "Amina Otieno",
  phone: "+254712000111",
  email: "amina@school.com",
  national_id: "33445566",
  status: "Available",
};

describe("POST /api/drivers › register with a bus", () => {
  it("Given a selected vehicle_id, When a driver is registered, Then the payload is accepted", async () => {
    const res = await POST(
      new Request("http://localhost/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...driverBody, vehicle_id: "veh-1" }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { vehicle_id: string | null } };
    expect(json.success).toBe(true);
    expect(json.data.vehicle_id).toBe("veh-1");
  });
});

describe("PUT /api/drivers/[id] › allocate bus", () => {
  it("Given a vehicle_id, When assignment is saved, Then success is returned", async () => {
    const res = await PUT(
      new Request("http://localhost/api/drivers/drv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: "veh-1" }),
      }),
      { params: Promise.resolve({ id: "drv-1" }) }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });

  it("Given an invalid empty vehicle_id, When assignment is saved, Then the API does not report success", async () => {
    const res = await PUT(
      new Request("http://localhost/api/drivers/drv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: "" }),
      }),
      { params: Promise.resolve({ id: "drv-1" }) }
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
