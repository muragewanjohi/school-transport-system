import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
}));

import { GET as getDrivers } from "@/app/api/drivers/route";
import { GET as getConductors } from "@/app/api/conductors/route";
import { GET as getAdmins } from "@/app/api/users/route";

const DEMO_NAMES = [
  "John Kamau",
  "David Ochieng",
  "Peter Ndwiga",
  "Michael Mwangi",
  "Jane Wanjiku",
  "Sarah Jenkins",
];

describe("empty staff roster › no demo staff", () => {
  it("Given a school with no driver profiles, When Staff Drivers loads, Then the list is empty", async () => {
    const res = await getDrivers(new Request("http://localhost/api/drivers"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Array<{ name: string }> };
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
    expect(json.data.some((row) => DEMO_NAMES.includes(row.name))).toBe(false);
  });

  it("Given a school with no conductor profiles, When Staff Conductors loads, Then the list is empty", async () => {
    const res = await getConductors(new Request("http://localhost/api/conductors"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Array<{ name: string }> };
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it("Given a school with no additional school_admin profiles, When Administrators loads, Then the list is empty", async () => {
    const res = await getAdmins(new Request("http://localhost/api/users"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Array<{ name: string }> };
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
    expect(json.data.some((row) => DEMO_NAMES.includes(row.name))).toBe(false);
  });
});
