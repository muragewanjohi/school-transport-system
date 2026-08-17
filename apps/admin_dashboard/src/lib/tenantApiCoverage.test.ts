import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dashboardRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const operationalRoutes = [
  "src/app/api/students/route.ts",
  "src/app/api/students/[id]/route.ts",
  "src/app/api/routes/route.ts",
  "src/app/api/routes/[id]/route.ts",
  "src/app/api/stops/route.ts",
  "src/app/api/stops/[id]/route.ts",
  "src/app/api/stops/reorder/route.ts",
  "src/app/api/stops/attach/route.ts",
  "src/app/api/schedules/route.ts",
  "src/app/api/schedules/[id]/route.ts",
  "src/app/api/fleet/route.ts",
  "src/app/api/fleet/[id]/route.ts",
  "src/app/api/fleet/[id]/maintenance/route.ts",
  "src/app/api/drivers/route.ts",
  "src/app/api/drivers/[id]/route.ts",
  "src/app/api/conductors/route.ts",
  "src/app/api/conductors/[id]/route.ts",
  "src/app/api/users/route.ts",
  "src/app/api/users/[id]/route.ts",
  "src/app/api/parents/route.ts",
  "src/app/api/campuses/route.ts",
  "src/app/api/trips/route.ts",
  "src/app/api/billing/route.ts",
  "src/app/api/config/route.ts",
  "src/app/api/telemetry/route.ts",
  "src/app/api/upload/route.ts",
  "src/app/api/driver/trips/route.ts",
  "src/app/api/driver/telemetry/route.ts",
  "src/app/api/driver/stop-visits/route.ts",
  "src/app/api/alerts/route.ts",
  "src/app/api/demo/go-live/route.ts",
];

describe("operational school APIs are tenant-scoped", () => {
  it.each(operationalRoutes)("%s imports requireOperationalTenant", (relPath) => {
    const src = readFileSync(resolve(dashboardRoot, relPath), "utf8");
    expect(src).toContain("requireOperationalTenant");
    expect(src).toMatch(/scope\.tenantId|\.eq\(["']tenant_id["']/);
  });
});
