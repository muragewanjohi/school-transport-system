import { z } from "zod";

export const optionalVehicleModelSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine(
    (value) => value === null || value.length >= 2,
    "Maker & model must be at least 2 characters if provided"
  )
  .refine(
    (value) => value === null || value.length <= 160,
    "Maker & model must be 160 characters or fewer"
  );

export const optionalVehicleCapacitySchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === "") return null;
    if (typeof value === "number") return value;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Number(trimmed);
  })
  .refine(
    (value) => value === null || (Number.isInteger(value) && value >= 1),
    "Seating capacity must be at least 1 seat if provided"
  );

export const vehicleCreateSchema = z.object({
  license_plate: z.string().min(3, "License plate must be at least 3 characters"),
  model: optionalVehicleModelSchema.optional().transform((value) => value ?? null),
  capacity: optionalVehicleCapacitySchema.optional().transform((value) => value ?? null),
  status: z.enum(["Active", "Maintenance", "Out of Service"]).default("Active"),
  last_service_date: z.string().nullable().optional(),
  next_service_date: z.string().nullable().optional(),
  insurance_expiry: z.string().nullable().optional(),
  notify_compliance_alerts: z.boolean().optional().default(false),
  active_driver_id: z.string().nullable().optional(),
  conductor_1_id: z.string().nullable().optional(),
  conductor_2_id: z.string().nullable().optional(),
});

export const vehicleUpdateSchema = z.object({
  license_plate: z.string().min(3).optional(),
  model: optionalVehicleModelSchema.optional(),
  capacity: optionalVehicleCapacitySchema.optional(),
  status: z.enum(["Active", "Maintenance", "Out of Service"]).optional(),
  last_service_date: z.string().nullable().optional(),
  next_service_date: z.string().nullable().optional(),
  insurance_expiry: z.string().nullable().optional(),
  notify_compliance_alerts: z.boolean().optional(),
  active_driver_id: z.string().nullable().optional(),
  conductor_1_id: z.string().nullable().optional(),
  conductor_2_id: z.string().nullable().optional(),
});
