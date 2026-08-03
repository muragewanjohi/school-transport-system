import { createHash, randomBytes } from "crypto";
import { DEMO_TENANT_SLUG } from "@/lib/tenantHost";

export const DEMO_VIEWER_EMAIL = "demo-viewer@onthebus.app";
export const DEMO_VIEWER_ADMIN_ROLE = "Demo Viewer";
export const DEMO_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
export const DEMO_ACCESS_TTL_HOURS = 24;

export function hashDemoToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createRawDemoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export { DEMO_TENANT_SLUG };
