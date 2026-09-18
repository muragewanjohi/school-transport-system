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

import { GET, PATCH, POST } from "@/app/api/demo-requests/route";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import {
  extendDemoOtpExpiry,
  provisionDemoStore,
  resetDemoAccessCredentials,
} from "@/lib/demoProvision";
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
  provisionPin: "482913",
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
  chain.in = vi.fn(self);
  chain.update = vi.fn(self);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
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

describe("PATCH /api/demo-requests › demo_expires_at", () => {
  const futureExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const readyToOnboard = {
    id: REQUEST_ID,
    full_name: "Ada Okello",
    email: LEAD_EMAIL,
    school_name: "Azima",
    country: "Kenya",
    city: "Nairobi",
    phone: "+254712345678",
    status: "ready_to_onboard",
    provisioned_tenant_id: TENANT_ID,
    role: "Principal",
    fleet_size: "1-5",
    preferred_time: "ASAP",
    notes: null,
    reviewed_at: "2026-08-10T08:00:00.000Z",
    created_at: "2026-08-10T07:00:00.000Z",
  };

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
    vi.mocked(extendDemoOtpExpiry).mockResolvedValue(undefined);
  });

  it("Given a provisioned demo, When expiry is extended, Then the tenant expiry is updated", async () => {
    const tenantUpdate = mockChain({ data: null, error: null });
    const from = vi.fn((table: string) => {
      if (table === "tenants") return tenantUpdate;
      return mockChain({ data: readyToOnboard, error: null });
    });
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await PATCH(
      jsonRequest({ id: REQUEST_ID, demo_expires_at: futureExpiry })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.demo_expires_at).toBe(futureExpiry);
    expect(tenantUpdate.update).toHaveBeenCalledWith({ demo_expires_at: futureExpiry });
    expect(extendDemoOtpExpiry).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      futureExpiry
    );
  });

  it("Given no provisioned store, When expiry is patched, Then the request is rejected", async () => {
    const pending = { ...readyToOnboard, status: "pending", provisioned_tenant_id: null };
    const from = vi.fn(() => mockChain({ data: pending, error: null }));
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await PATCH(
      jsonRequest({ id: REQUEST_ID, demo_expires_at: futureExpiry })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no provisioned demo store/i);
    expect(extendDemoOtpExpiry).not.toHaveBeenCalled();
  });

  it("Given a past expiry, When patched, Then the request is rejected", async () => {
    const from = vi.fn(() => mockChain({ data: readyToOnboard, error: null }));
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await PATCH(
      jsonRequest({ id: REQUEST_ID, demo_expires_at: "2020-01-01T00:00:00.000Z" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/future date/i);
    expect(extendDemoOtpExpiry).not.toHaveBeenCalled();
  });
});

describe("GET /api/demo-requests › summary badge", () => {
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
  });

  function summaryRequest() {
    return new Request("http://localhost/api/demo-requests?summary=1");
  }

  it("Given pending and ready_to_onboard leads, When summary is loaded, Then the badge counts pending only", async () => {
    const from = vi.fn(() =>
      mockChain({
        data: [{ status: "pending" }, { status: "ready_to_onboard" }],
        error: null,
      })
    );
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await GET(summaryRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      pending_count: 1,
      ready_to_onboard_count: 1,
      attention_count: 1,
    });
  });

  it("Given only an approved ready_to_onboard request, When summary is loaded, Then the badge is 0", async () => {
    const from = vi.fn(() =>
      mockChain({
        data: [{ status: "ready_to_onboard" }],
        error: null,
      })
    );
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await GET(summaryRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      pending_count: 0,
      ready_to_onboard_count: 1,
      attention_count: 0,
    });
  });
});

describe("POST /api/demo-requests › validation", () => {
  const validLead = {
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

  function postRequest(body: unknown, ip: string) {
    return new Request("http://localhost/api/demo-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    });
  }

  it("Given an autofilled honeypot, When submitted, Then it is accepted without a Too big error", async () => {
    const res = await POST(
      postRequest({ ...validLead, company_website: "https://password-manager.example" }, "203.0.113.21")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/too big/i);
    expect(body.data.id).toBe("honeypot");
  });

  it("Given an invalid work email, When submitted, Then the email field is named", async () => {
    const res = await POST(postRequest({ ...validLead, email: "not-an-email" }, "203.0.113.22"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.fields.email).toBe("Enter a valid work email");
    expect(body.error).toBe("Enter a valid work email");
    expect(body.error).not.toMatch(/too big/i);
  });
});

describe("PATCH /api/demo-requests › reprovision", () => {
  const approvedNoStore = {
    id: REQUEST_ID,
    full_name: "Ada Okello",
    email: LEAD_EMAIL,
    school_name: "Azima",
    country: "Kenya",
    city: "Nairobi",
    phone: "+254712345678",
    status: "ready_to_onboard",
    provisioned_tenant_id: null,
    role: "Principal",
    fleet_size: "1-5",
    preferred_time: "ASAP",
    notes: null,
    reviewed_at: "2026-08-10T08:00:00.000Z",
    created_at: "2026-08-10T07:00:00.000Z",
  };

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

  it("Given an approved request with no store, When reprovision is requested, Then a new store is created", async () => {
    const from = vi.fn(() => mockChain({ data: approvedNoStore, error: null }));
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);
    vi.mocked(provisionDemoStore).mockResolvedValue(provisionResult);

    const res = await PATCH(jsonRequest({ id: REQUEST_ID, action: "reprovision" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.demo_expires_at).toBe(provisionResult.expiresAt);
    expect(body.data.demo_slug).toBe(provisionResult.slug);
    expect(provisionDemoStore).toHaveBeenCalledOnce();
    expect(notifyDemoReady).toHaveBeenCalledOnce();
  });

  it("Given a live store, When reprovision is requested, Then it is rejected", async () => {
    const from = vi.fn(() =>
      mockChain({
        data: { ...approvedNoStore, provisioned_tenant_id: TENANT_ID },
        error: null,
      })
    );
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await PATCH(jsonRequest({ id: REQUEST_ID, action: "reprovision" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already has a live demo store/i);
    expect(provisionDemoStore).not.toHaveBeenCalled();
  });
});
