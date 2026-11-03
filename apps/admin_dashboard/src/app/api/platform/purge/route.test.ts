import { beforeEach, describe, expect, it, vi } from "vitest";

const otpDeletes: Array<{ col: string; value: string }> = [];

/** Thenable query builder: every chain resolves to an empty result, except OTP log deletes are recorded. */
function builder(table: string) {
  let deleting = false;
  const api: Record<string, unknown> = {};
  const chain = () => api;
  for (const method of ["select", "eq", "not", "neq", "is", "update", "order"]) api[method] = chain;
  api.delete = () => {
    deleting = true;
    return api;
  };
  api.lt = (col: string, value: string) => {
    if (table === "otp_delivery_log" && deleting) otpDeletes.push({ col, value });
    return api;
  };
  api.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: table === "otp_delivery_log" ? [{ id: "1" }, { id: "2" }] : [], error: null }).then(resolve);
  return api;
}

vi.mock("@/lib/supabaseClient", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({ from: (table: string) => builder(table) }),
}));
vi.mock("@/lib/platformSettings", () => ({
  readPlatformNumberSettings: async () => ({ suspended_purge_days: 0, deleted_purge_days: 0 }),
}));
vi.mock("@/lib/vercelDomains", () => ({ removeTenantSubdomain: async () => ({ ok: true }) }));
vi.mock("@/lib/authApi", () => ({
  getCallerProfile: async () => null,
  isPlatformSuperAdmin: () => false,
}));

import { GET } from "@/app/api/platform/purge/route";

describe("GET /api/platform/purge › OTP delivery log retention", () => {
  beforeEach(() => {
    otpDeletes.length = 0;
    process.env.CRON_SECRET = "cron-test";
  });

  it("Given the nightly cron, When purge runs, Then OTP log rows older than 30 days are deleted", async () => {
    // Act
    const res = await GET(
      new Request("http://localhost/api/platform/purge", { headers: { authorization: "Bearer cron-test" } })
    );
    const body = (await res.json()) as { data: { otpLogPurged: number } };

    // Assert
    expect(res.status).toBe(200);
    expect(otpDeletes).toHaveLength(1);
    expect(otpDeletes[0]?.col).toBe("created_at");
    const ageDays = (Date.now() - new Date(otpDeletes[0]!.value).getTime()) / (24 * 3600 * 1000);
    expect(ageDays).toBeCloseTo(30, 1);
    expect(body.data.otpLogPurged).toBe(2);
  });

  it("Given no cron secret or admin, When purge is called, Then 401 and nothing is deleted", async () => {
    const res = await GET(new Request("http://localhost/api/platform/purge"));

    expect(res.status).toBe(401);
    expect(otpDeletes).toHaveLength(0);
  });
});
