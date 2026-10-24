import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = { __service: true };

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: vi.fn(() => serviceClient),
}));

import { signDriverSession, verifyDriverSession } from "@/lib/driverSession";
import { signParentSession, verifyParentSession } from "@/lib/parentSession";
import { requireOperationalTenant } from "@/lib/tenantScope";
import { POST as createAdmin } from "@/app/api/users/route";

const SCHOOL_A = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SHARED_SECRET = "unit-test-shared-secret";

function reprefix(token: string, prefix: "drv" | "par"): string {
  const [, data, sig] = token.split(".");
  return `${prefix}.${data}.${sig}`;
}

function driverToken(role = "driver"): string {
  return signDriverSession({ sub: USER_ID, tenant_id: SCHOOL_A, role, vehicle_id: null });
}

function bearer(token: string, url = "http://school-a.localhost/api/x", init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

const prevDriver = process.env.DRIVER_SESSION_SECRET;
const prevParent = process.env.PARENT_SESSION_SECRET;

beforeEach(() => {
  // Same secret for both, the worst case for a prefix swap
  process.env.DRIVER_SESSION_SECRET = SHARED_SECRET;
  process.env.PARENT_SESSION_SECRET = SHARED_SECRET;
});

afterEach(() => {
  if (prevDriver === undefined) delete process.env.DRIVER_SESSION_SECRET;
  else process.env.DRIVER_SESSION_SECRET = prevDriver;
  if (prevParent === undefined) delete process.env.PARENT_SESSION_SECRET;
  else process.env.PARENT_SESSION_SECRET = prevParent;
});

describe("HMAC role binding", () => {
  it("Given a parent token re-prefixed as drv. with a shared secret, When verified as driver, Then it is rejected", () => {
    // Arrange
    const parentToken = signParentSession({ sub: USER_ID, tenant_id: SCHOOL_A });
    // Act
    const result = verifyDriverSession(reprefix(parentToken, "drv"));
    // Assert
    expect(result).toBeNull();
  });

  it("Given a driver token re-prefixed as par. with a shared secret, When verified as parent, Then it is rejected", () => {
    const result = verifyParentSession(reprefix(driverToken(), "par"));
    expect(result).toBeNull();
  });

  it("Given a signed drv. token with an unknown role, When verified, Then it is rejected", () => {
    expect(verifyDriverSession(driverToken("school_admin"))).toBeNull();
  });

  it("Given a signed drv. token with role conductor, When verified, Then the payload is returned", () => {
    expect(verifyDriverSession(driverToken("conductor"))?.role).toBe("conductor");
  });
});

describe("requireOperationalTenant › crew token scope", () => {
  it("Given a driver token, When an endpoint has not opted in, Then 403 and no client is returned", async () => {
    const result = await requireOperationalTenant(bearer(driverToken()));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(result).not.toHaveProperty("client");
  });

  it("Given a driver token, When the endpoint opts in with allowDriver, Then scope is the token's tenant", async () => {
    const result = await requireOperationalTenant(bearer(driverToken()), { allowDriver: true });

    expect(result).toEqual({ ok: true, tenantId: SCHOOL_A, client: serviceClient });
  });

  it("Given a parent token re-prefixed as drv., When an opted-in endpoint is called, Then 401", async () => {
    const forged = reprefix(signParentSession({ sub: USER_ID, tenant_id: SCHOOL_A }), "drv");

    const result = await requireOperationalTenant(bearer(forged), { allowDriver: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});

describe("POST /api/users › crew tokens cannot create admins", () => {
  it("Given a valid driver token, When it posts a new school admin, Then 403", async () => {
    // Arrange
    const request = bearer(driverToken(), "http://school-a.localhost/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Mallory",
        phone: "+254700000000",
        email: "mallory@example.org",
        admin_role: "Super Admin",
      }),
    });
    // Act
    const res = await createAdmin(request);
    // Assert
    expect(res.status).toBe(403);
    expect(((await res.json()) as { success: boolean }).success).toBe(false);
  });
});

describe("crew allowlist does not drift from context/architecture.md", () => {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app", "api");

  // Handlers (by count per file) that accept drv.* tokens
  const expected: Record<string, number> = {
    "config/route.ts": 1, // GET
    "fleet/route.ts": 1, // GET
    "stops/route.ts": 1, // GET
    "students/route.ts": 1, // GET
    "students/[id]/route.ts": 1, // PUT (status only)
    "trips/route.ts": 2, // GET, PUT
    "driver/trips/route.ts": 1,
    "driver/telemetry/route.ts": 1,
    "driver/stop-visits/route.ts": 1,
    "driver/school-arrival/route.ts": 1,
    "driver/beacon/provision/route.ts": 1,
    "driver/beacon/revoke/route.ts": 1,
    "driver/beacon/students/route.ts": 1,
    "driver/beacon/template/route.ts": 1,
  };

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return routeFiles(full);
      return name === "route.ts" ? [full] : [];
    });
  }

  it("Given every API route, When allowDriver opt-ins are counted, Then only the documented crew handlers opt in", () => {
    const actual: Record<string, number> = {};
    for (const file of routeFiles(apiRoot)) {
      const count = (readFileSync(file, "utf8").match(/allowDriver:\s*true/g) ?? []).length;
      if (count > 0) actual[relative(apiRoot, file).replace(/\\/g, "/")] = count;
    }

    expect(actual).toEqual(expected);
  });
});
