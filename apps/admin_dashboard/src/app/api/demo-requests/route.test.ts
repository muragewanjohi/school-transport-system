import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authApi", () => ({
  getCallerProfile: vi.fn(),
  isPlatformSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/demoProvision", () => ({
  DEMO_DEFAULT_EXPIRY_DAYS: 14,
  provisionDemoStore: vi.fn(),
  purgeDemoTenant: vi.fn(),
  extendDemoOtpExpiry: vi.fn(),
  resetDemoAccessCredentials: vi.fn(),
}));

vi.mock("@/lib/demoRequestEmails", () => ({
  notifyDemoReady: vi.fn(),
  notifyRequesterCompleted: vi.fn(),
  notifyRequesterReceived: vi.fn(),
  notifySales: vi.fn(),
}));

import { PATCH } from "@/app/api/demo-requests/route";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { provisionDemoStore, resetDemoAccessCredentials } from "@/lib/demoProvision";
import { notifyDemoReady } from "@/lib/demoRequestEmails";

const REQUEST_ID = "c7ba705a-d6ae-477c-a802-c06951ef2136";
const TENANT_ID = "4e562c76-4e98-40bd-9d22-7b6e992c4b49";
const LEAD_EMAIL = "lead@school.example";

const provisionResult = {
  tenantId: TENANT_ID,
  slug: "azima-demo",
  schoolUrl: "https://azima-demo.onthebusapp.com/login",
  adminEmail: "admin.azima@demo.onthebus.app",
  adminPassword: "TempPass-abc123",
  phone: "+254712345678",
  otp: "654321",
  expiresAt: "2026-08-24T00:00:00.000Z",
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/demo-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.update = vi.fn(self);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

describe("PATCH /api/demo-requests › confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCallerProfile).mockResolvedValue({
      id: "platform-admin",
      role: "super_admin",
      tenant_id: null,
      email: "platform@onthebus.app",
      name: "Platform",
      admin_role: null,
      phone: null,
    });
    vi.mocked(isPlatformSuperAdmin).mockReturnValue(true);
    vi.mocked(notifyDemoReady).mockResolvedValue(true);
  });

  it("Given a pending lead, When confirmed, Then emails access details to the requester email", async () => {
    const pending = {
      id: REQUEST_ID,
      full_name: "Ada Okello",
      email: LEAD_EMAIL,
      school_name: "Azima",
      country: "Kenya",
      city: "Nairobi",
      phone: "+254712345678",
      status: "pending",
      provisioned_tenant_id: null,
    };
    const confirmedRow = {
      ...pending,
      status: "confirmed",
      provisioned_tenant_id: TENANT_ID,
      role: "Principal",
      fleet_size: "1-5",
      preferred_time: "ASAP",
      notes: null,
      reviewed_at: "2026-08-10T08:00:00.000Z",
      created_at: "2026-08-10T07:00:00.000Z",
    };

    const from = vi.fn((table: string) => {
      if (table === "demo_requests") {
        // first select existing, then update confirmed
        if (from.mock.calls.filter((c) => c[0] === "demo_requests").length === 1) {
          return mockChain({ data: pending, error: null });
        }
        return mockChain({ data: confirmedRow, error: null });
      }
      return mockChain({ data: null, error: null });
    });

    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);
    vi.mocked(provisionDemoStore).mockResolvedValue(provisionResult);

    const res = await PATCH(jsonRequest({ id: REQUEST_ID, status: "confirmed" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provision_email_sent).toBe(true);
    expect(notifyDemoReady).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyDemoReady).mock.calls[0][0]).toMatchObject({
      email: LEAD_EMAIL,
      schoolName: "Azima",
      schoolUrl: provisionResult.schoolUrl,
      adminPassword: provisionResult.adminPassword,
      otp: provisionResult.otp,
    });
    expect(vi.mocked(notifyDemoReady).mock.calls[0][0].email).not.toBe(
      provisionResult.adminEmail
    );
  });
});

describe("PATCH /api/demo-requests › resend_access_email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCallerProfile).mockResolvedValue({
      id: "platform-admin",
      role: "super_admin",
      tenant_id: null,
      email: "platform@onthebus.app",
      name: "Platform",
      admin_role: null,
      phone: null,
    });
    vi.mocked(isPlatformSuperAdmin).mockReturnValue(true);
    vi.mocked(notifyDemoReady).mockResolvedValue(true);
  });

  it("Given a confirmed store, When resend is requested, Then emails the requester with a new admin password", async () => {
    const confirmed = {
      id: REQUEST_ID,
      full_name: "Ada Okello",
      email: LEAD_EMAIL,
      school_name: "Azima",
      country: "Kenya",
      city: "Nairobi",
      phone: "+254712345678",
      status: "confirmed",
      provisioned_tenant_id: TENANT_ID,
      role: "Principal",
      fleet_size: "1-5",
      preferred_time: "ASAP",
      notes: null,
      reviewed_at: "2026-08-10T08:00:00.000Z",
      created_at: "2026-08-10T07:00:00.000Z",
    };

    const from = vi.fn(() => mockChain({ data: confirmed, error: null }));
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const resetResult = {
      ...provisionResult,
      adminPassword: "NewPass-xyz789",
    };
    vi.mocked(resetDemoAccessCredentials).mockResolvedValue(resetResult);

    const res = await PATCH(
      jsonRequest({ id: REQUEST_ID, action: "resend_access_email" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provision_email_sent).toBe(true);
    expect(body.credentials.admin_password).toBe("NewPass-xyz789");
    expect(resetDemoAccessCredentials).toHaveBeenCalledWith(expect.anything(), TENANT_ID);
    expect(notifyDemoReady).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyDemoReady).mock.calls[0][0]).toMatchObject({
      email: LEAD_EMAIL,
      adminPassword: "NewPass-xyz789",
      otp: provisionResult.otp,
    });
  });
});
