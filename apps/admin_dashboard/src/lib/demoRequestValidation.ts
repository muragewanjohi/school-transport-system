import { z } from "zod";

export const DEMO_REQUEST_ROLES = [
  "Transport Manager",
  "School Admin",
  "Principal",
  "Other",
] as const;

export const DEMO_REQUEST_FLEET_SIZES = ["1-5", "6-15", "16+"] as const;

export const DEMO_REQUEST_PREFERRED_TIMES = ["ASAP", "This week", "Next week"] as const;

export const DEMO_REQUEST_FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  role: "Role",
  school_name: "School name",
  country: "Country",
  city: "City / area",
  phone: "WhatsApp or phone",
  email: "Work email",
  fleet_size: "Approx. buses",
  preferred_time: "Preferred time",
  notes: "Notes",
};

export const demoRequestSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters)")
    .max(120, "Full name must be 120 characters or fewer"),
  role: z.enum(DEMO_REQUEST_ROLES, {
    error: "Select a role",
  }),
  school_name: z
    .string()
    .trim()
    .min(2, "Enter the school name")
    .max(160, "School name must be 160 characters or fewer"),
  country: z
    .string()
    .trim()
    .min(2, "Select a country")
    .max(120, "Country must be 120 characters or fewer"),
  city: z
    .string()
    .trim()
    .min(2, "Enter a city or area")
    .max(120, "City / area must be 120 characters or fewer"),
  phone: z
    .string()
    .min(10, "Enter a WhatsApp or phone number")
    .max(40, "Phone number is too long")
    .regex(/^\+\d{8,18}$/, "Phone must include a country code, e.g. +254712345678"),
  email: z
    .string()
    .trim()
    .min(1, "Enter a work email")
    .email("Enter a valid work email"),
  fleet_size: z.enum(DEMO_REQUEST_FLEET_SIZES, {
    error: "Select an approximate fleet size",
  }),
  preferred_time: z.enum(DEMO_REQUEST_PREFERRED_TIMES, {
    error: "Select a preferred time",
  }),
  notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
  /** Honeypot — bots fill it; humans leave it empty. Never surface as a form error. */
  company_website: z.string().max(200).optional(),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;

export function flattenDemoRequestFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || key === "company_website") continue;
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function summarizeDemoRequestErrors(fields: Record<string, string>): string {
  const orderedKeys = Object.keys(DEMO_REQUEST_FIELD_LABELS);
  const entries = [
    ...orderedKeys.filter((key) => fields[key]),
    ...Object.keys(fields).filter((key) => !orderedKeys.includes(key)),
  ].map((key) => [key, fields[key]] as const);
  if (entries.length === 0) return "Please check the form and try again.";
  if (entries.length === 1) return entries[0][1];
  const labels = entries
    .map(([key]) => DEMO_REQUEST_FIELD_LABELS[key] ?? key)
    .filter((label) => label.length > 0);
  return `Please fix: ${labels.join(", ")}`;
}

export function isDemoRequestHoneypotFilled(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}
