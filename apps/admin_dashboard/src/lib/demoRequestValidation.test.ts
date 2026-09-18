import { describe, expect, it } from "vitest";
import {
  demoRequestSchema,
  flattenDemoRequestFieldErrors,
  isDemoRequestHoneypotFilled,
  summarizeDemoRequestErrors,
} from "@/lib/demoRequestValidation";

const valid = {
  full_name: "Alex Kamwende",
  role: "School Admin",
  school_name: "Alex school",
  country: "Kenya",
  city: "Nairobi",
  phone: "+254784414714",
  email: "alex@school.example",
  fleet_size: "1-5",
  preferred_time: "This week",
  notes: "to test",
};

describe("demoRequestSchema", () => {
  it("valid payload › parses without errors", () => {
    const parsed = demoRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("filled honeypot › still parses so spam is not shown as Too big", () => {
    const parsed = demoRequestSchema.safeParse({
      ...valid,
      company_website: "https://autofilled.example",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(isDemoRequestHoneypotFilled(parsed.data.company_website)).toBe(true);
    }
  });

  it("invalid email › returns a field message for work email", () => {
    const parsed = demoRequestSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fields = flattenDemoRequestFieldErrors(parsed.error);
    expect(fields.email).toBe("Enter a valid work email");
    expect(summarizeDemoRequestErrors(fields)).toBe("Enter a valid work email");
    expect(JSON.stringify(fields)).not.toMatch(/too big/i);
  });

  it("notes over 1000 characters › names Notes instead of Too big", () => {
    const parsed = demoRequestSchema.safeParse({
      ...valid,
      notes: "x".repeat(1001),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fields = flattenDemoRequestFieldErrors(parsed.error);
    expect(fields.notes).toBe("Notes must be 1000 characters or fewer");
    expect(fields.notes).not.toMatch(/too big/i);
  });

  it("several invalid fields › lists each highlighted field", () => {
    const parsed = demoRequestSchema.safeParse({
      ...valid,
      full_name: "A",
      email: "nope",
      phone: "1234567890",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fields = flattenDemoRequestFieldErrors(parsed.error);
    expect(fields.full_name).toMatch(/full name/i);
    expect(fields.email).toBe("Enter a valid work email");
    expect(fields.phone).toMatch(/country code/i);
    expect(summarizeDemoRequestErrors(fields)).toBe(
      "Please fix: Full name, WhatsApp or phone, Work email"
    );
  });

  it("honeypot issues › are omitted from field errors shown to the visitor", () => {
    const parsed = demoRequestSchema.safeParse({
      ...valid,
      company_website: "x".repeat(201),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fields = flattenDemoRequestFieldErrors(parsed.error);
    expect(fields.company_website).toBeUndefined();
    expect(Object.keys(fields)).toHaveLength(0);
  });
});
