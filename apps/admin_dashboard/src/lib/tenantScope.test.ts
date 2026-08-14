import { describe, expect, it } from "vitest";
import { decideOperationalTenant, hostSlugFromRequest } from "@/lib/tenantScope";

const SCHOOL_A = "11111111-1111-1111-1111-111111111111";
const SCHOOL_B = "22222222-2222-2222-2222-222222222222";

describe("decideOperationalTenant › school admin only sees their own tenant", () => {
  it("Given a school_admin for School A on School A's host, When scope is resolved, Then School A is used", () => {
    const result = decideOperationalTenant({
      role: "school_admin",
      profileTenantId: SCHOOL_A,
      hostTenantId: SCHOOL_A,
    });
    expect(result).toEqual({ ok: true, tenantId: SCHOOL_A });
  });
});

describe("decideOperationalTenant › school admin blocked on another school's host", () => {
  it("Given a school_admin for School A, When they open School B, Then access is denied", () => {
    const result = decideOperationalTenant({
      role: "school_admin",
      profileTenantId: SCHOOL_A,
      hostTenantId: SCHOOL_B,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/another school's data/i);
  });
});

describe("decideOperationalTenant › platform operator on a school host is scoped to that school", () => {
  it("Given a platform super_admin on azima-demo, When scope is resolved, Then only that host tenant is used", () => {
    const result = decideOperationalTenant({
      role: "super_admin",
      profileTenantId: null,
      hostTenantId: SCHOOL_B,
    });
    expect(result).toEqual({ ok: true, tenantId: SCHOOL_B });
  });

  it("Given a platform super_admin without a school host, When scope is resolved, Then school data is denied", () => {
    const result = decideOperationalTenant({
      role: "super_admin",
      profileTenantId: null,
      hostTenantId: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("hostSlugFromRequest", () => {
  it("reads x-tenant-slug from middleware", () => {
    const request = new Request("http://localhost/api/students", {
      headers: { "x-tenant-slug": "azima-demo" },
    });
    expect(hostSlugFromRequest(request)).toBe("azima-demo");
  });
});
