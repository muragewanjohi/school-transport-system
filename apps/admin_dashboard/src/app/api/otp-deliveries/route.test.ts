import { beforeEach, describe, expect, it, vi } from "vitest";

const SCHOOL_A = "aaaaaaaa-0000-4000-8000-000000000001";
const filters: Record<string, unknown> = {};
let dbRows: Array<Record<string, unknown>> = [];
let scopeResult: unknown;

vi.mock("@/lib/supabaseClient", () => ({ isSupabaseConfigured: true }));

vi.mock("@/lib/tenantScope", () => ({
  requireOperationalTenant: vi.fn(async () => scopeResult),
  tenantScopeError: (r: { status: number; error: string }) =>
    new Response(JSON.stringify({ success: false, error: r.error }), { status: r.status }),
}));

function fakeClient() {
  const api = {
    from: (table: string) => {
      filters.table = table;
      return api;
    },
    select: () => api,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return api;
    },
    gte: (col: string, val: unknown) => {
      filters[`${col}>=`] = val;
      return api;
    },
    order: () => api,
    limit: async () => ({ data: dbRows, error: null }),
  };
  return api;
}

import { GET } from "@/app/api/otp-deliveries/route";

describe("GET /api/otp-deliveries", () => {
  beforeEach(() => {
    for (const key of Object.keys(filters)) delete filters[key];
    scopeResult = { ok: true, tenantId: SCHOOL_A, client: fakeClient() };
    dbRows = [
      {
        profile_id: "p1",
        channel: "sms",
        status: "failed",
        failure_reason: "UserInBlacklist",
        destination: "+254******463",
        created_at: "2026-11-03T07:00:00.000Z",
        updated_at: null,
        profile: { phone: "+254701689463" },
      },
      {
        profile_id: "p1",
        channel: "email",
        status: "delivered",
        failure_reason: null,
        destination: "c***@gmail.com",
        created_at: "2026-11-03T07:01:00.000Z",
        updated_at: null,
        profile: [{ phone: "+254701689463" }],
      },
    ];
  });

  it("Given a school admin of School A, When they load deliveries, Then only School A's last 30 days are queried and the latest per profile is returned", async () => {
    // Act
    const res = await GET(new Request("http://school-a.localhost/api/otp-deliveries"));
    const body = (await res.json()) as { success: boolean; data: Array<Record<string, unknown>> };

    // Assert
    expect(res.status).toBe(200);
    expect(filters.table).toBe("otp_delivery_log");
    expect(filters.tenant_id).toBe(SCHOOL_A);
    const since = new Date(String(filters["created_at>="])).getTime();
    expect(Date.now() - since).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(Date.now() - since).toBeLessThan(31 * 24 * 3600 * 1000);
    expect(body.data).toEqual([
      expect.objectContaining({ profile_id: "p1", channel: "email", status: "delivered", phone: "+254701689463" }),
    ]);
    expect(body.data[0]).not.toHaveProperty("profile");
  });

  it("Given the tenant scope is refused (e.g. crew token), When requested, Then that status is returned", async () => {
    scopeResult = { ok: false, status: 403, error: "This endpoint is for school administrators only." };

    const res = await GET(new Request("http://school-a.localhost/api/otp-deliveries"));

    expect(res.status).toBe(403);
  });
});
