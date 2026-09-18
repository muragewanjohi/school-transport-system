import { describe, expect, it } from "vitest";
import { mapStudentProfile } from "@/lib/studentRecord";

describe("mapStudentProfile › beacon_tag › attached when present", () => {
  it("Given active beacon fields, When mapped, Then beacon_tag is included", () => {
    const mapped = mapStudentProfile(
      {
        guardians: [],
        status: "Present",
        address: null,
        pickup_location: null,
      },
      {
        uuid: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
        major: 1,
        minor: 7,
        mac: "AA:BB:CC:DD:EE:FF",
        device_name: "CP35-49B1",
        status: "active",
        provisioned_at: "2026-09-18T12:00:00.000Z",
      }
    );
    expect(mapped.beacon_tag?.minor).toBe(7);
    expect(mapped.beacon_tag?.mac).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("Given no beacon, When mapped, Then beacon_tag is null", () => {
    const mapped = mapStudentProfile({
      guardians: [],
      status: "Present",
      address: null,
      pickup_location: null,
    });
    expect(mapped.beacon_tag).toBeNull();
  });
});
