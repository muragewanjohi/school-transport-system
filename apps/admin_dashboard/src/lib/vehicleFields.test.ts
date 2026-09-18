import { describe, expect, it } from "vitest";
import { vehicleCreateSchema, vehicleUpdateSchema } from "@/lib/vehicleFields";

const required = {
  license_plate: "KCD 432Y",
};

describe("vehicleCreateSchema", () => {
  it("omitted maker/model and seating capacity › still creates", () => {
    const parsed = vehicleCreateSchema.safeParse(required);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.model).toBeNull();
    expect(parsed.data.capacity).toBeNull();
  });

  it("blank maker/model and capacity › stored as null", () => {
    const parsed = vehicleCreateSchema.safeParse({
      ...required,
      model: "   ",
      capacity: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.model).toBeNull();
    expect(parsed.data.capacity).toBeNull();
  });

  it("one-character model › rejected", () => {
    const parsed = vehicleCreateSchema.safeParse({ ...required, model: "X" });
    expect(parsed.success).toBe(false);
  });

  it("zero seating capacity › rejected", () => {
    const parsed = vehicleCreateSchema.safeParse({ ...required, capacity: 0 });
    expect(parsed.success).toBe(false);
  });
});

describe("vehicleUpdateSchema", () => {
  it("omitted maker/model is not cleared on update", () => {
    const parsed = vehicleUpdateSchema.safeParse({ license_plate: "KCD 432Y" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.model).toBeUndefined();
    expect(parsed.data.capacity).toBeUndefined();
  });
});
