import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashProvisionPin } from "@/lib/beaconProvision";

const mockRequireOperationalTenant = vi.fn();
const mockVerifyDriverSession = vi.fn();
const mockExtractBearerToken = vi.fn();

vi.mock("@/lib/tenantScope", () => ({
  requireOperationalTenant: (...args: unknown[]) => mockRequireOperationalTenant(...args),
  tenantScopeError: (result: { status: number; error: string }) =>
    Response.json({ success: false, error: result.error }, { status: result.status }),
}));

vi.mock("@/lib/driverSession", () => ({
  verifyDriverSession: (...args: unknown[]) => mockVerifyDriverSession(...args),
}));

vi.mock("@/lib/authApi", () => ({
  extractBearerToken: (...args: unknown[]) => mockExtractBearerToken(...args),
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

import { GET } from "./route";

const PIN = "482913";
const PIN_HASH = hashProvisionPin(PIN);

describe("GET /api/driver/beacon/template › driver session › returns template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractBearerToken.mockReturnValue("drv.token");
    mockVerifyDriverSession.mockReturnValue({
      sub: "driver-1",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      role: "driver",
      vehicle_id: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("Given driver auth and PIN, When template requested, Then 200 with unlock passwords", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        beacon_uuid: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
        beacon_device_password_enc: null,
        beacon_provision_pin_hash: PIN_HASH,
        beacon_next_minor: 2,
      },
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const headSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 0 }),
      }),
    });

    mockRequireOperationalTenant.mockResolvedValue({
      ok: true,
      tenantId: "11111111-1111-4111-8111-111111111111",
      client: {
        from: (table: string) => {
          if (table === "tenant_configs") {
            return {
              select: () => ({ eq: () => ({ maybeSingle }) }),
              update,
            };
          }
          return {
            select: headSelect,
          };
        },
      },
    });

    const res = await GET(
      new Request(`http://localhost/api/driver/beacon/template?provision_pin=${PIN}`)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.uuid).toBe("A1B2C3D4-E5F6-4789-A012-3456789ABCDE");
    expect(json.data.minor).toBe(2);
    expect(json.data.unlock_password).toBe("DX1234");
    expect(json.data.new_device_password).toHaveLength(6);
  });

  it("Given missing PIN hash, When template requested, Then 403 not configured", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        beacon_uuid: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
        beacon_device_password_enc: null,
        beacon_provision_pin_hash: null,
        beacon_next_minor: 1,
      },
    });
    mockRequireOperationalTenant.mockResolvedValue({
      ok: true,
      tenantId: "11111111-1111-4111-8111-111111111111",
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle }) }),
        }),
      },
    });

    const res = await GET(
      new Request("http://localhost/api/driver/beacon/template?provision_pin=123456")
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/not configured/i);
  });

  it("Given wrong PIN, When template requested, Then 403 invalid", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        beacon_uuid: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
        beacon_device_password_enc: null,
        beacon_provision_pin_hash: PIN_HASH,
        beacon_next_minor: 1,
      },
    });
    mockRequireOperationalTenant.mockResolvedValue({
      ok: true,
      tenantId: "11111111-1111-4111-8111-111111111111",
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle }) }),
        }),
      },
    });

    const res = await GET(
      new Request("http://localhost/api/driver/beacon/template?provision_pin=000000")
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });
});

describe("GET /api/driver/beacon/template › missing session › 401", () => {
  it("Given no bearer token, When template requested, Then 401", async () => {
    mockExtractBearerToken.mockReturnValue(null);
    const res = await GET(new Request("http://localhost/api/driver/beacon/template"));
    expect(res.status).toBe(401);
  });
});
