import { describe, expect, it } from "vitest";
import {
  mapStudentProfile,
  studentApiErrorMessage,
  studentDbWriteFields,
} from "@/lib/studentRecord";

describe("studentDbWriteFields", () => {
  it("home pin coordinates › writes pickup_location WKT and omits latitude columns", () => {
    const payload = studentDbWriteFields({
      name: "Amina Wanjiku",
      address: "Westlands, Nairobi",
      latitude: -1.2,
      longitude: 36.8,
    });

    expect(payload.name).toBe("Amina Wanjiku");
    expect(payload.address).toBe("Westlands, Nairobi");
    expect(payload.pickup_location).toBe("POINT(36.8 -1.2)");
    expect(payload).not.toHaveProperty("latitude");
    expect(payload).not.toHaveProperty("longitude");
  });
});

describe("mapStudentProfile", () => {
  it("row with address and GeoJSON point › hydrates edit-form coordinates", () => {
    const mapped = mapStudentProfile({
      name: "Amina Wanjiku",
      guardians: [{ name: "Jane Wanjiku", phone: "+254700111222" }],
      status: "Present",
      address: "Westlands, Nairobi",
      pickup_location: { type: "Point", coordinates: [36.8, -1.2] },
    });

    expect(mapped.address).toBe("Westlands, Nairobi");
    expect(mapped.latitude).toBe(-1.2);
    expect(mapped.longitude).toBe(36.8);
    expect(mapped.guardians).toEqual([
      { name: "Jane Wanjiku", phone: "+254700111222" },
    ]);
  });
});

describe("studentApiErrorMessage", () => {
  it("field errors object › joins messages for the edit form", () => {
    expect(
      studentApiErrorMessage({
        errors: { name: ["Name must be at least 2 characters"] },
      })
    ).toBe("name: Name must be at least 2 characters");
  });
});
