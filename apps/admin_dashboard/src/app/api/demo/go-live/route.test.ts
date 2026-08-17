import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authApi", () => ({
  getCallerProfile: vi.fn(),
  isDemoReadonly: vi.fn(),
  demoReadonlyForbiddenResponse: vi.fn(() =>
    Response.json({ success: false, error: "Demo Viewer access is read-only." }, { status: 403 })
  ),
}));

vi.mock("@/lib/tenantScope", () => ({
  requireOperationalTenant: vi.fn(),
  tenantScopeError: vi.fn((result: { status: number; error: string }) =>
    Response.json({ success: false, error: result.error }, { status: result.status })
  ),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/demoRequestEmails", () => ({
  notifyGoLiveRequested: vi.fn(),
}));

import { GET, POST } from "@/app/api/demo/go-live/route";
import { getCallerProfile, isDemoReadonly } from "@/lib/authApi";
import { requireOperationalTenant } from "@/lib/tenantScope";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { notifyGoLiveRequested } from "@/lib/demoRequestEmails";
import { DEMO_GO_LIVE_STATUS } from "@/lib/demoGoLive";

const TENANT_ID = "4e562c76-4e98-40bd-9d22-7b6e992c4b49";
const REQUEST_ID = "c7ba705a-d6ae-477c-a802-c06951ef2136";

const schoolAdmin = {
  id: "admin-1",
  role: "school_admin",
  tenant_id: TENANT_ID,
  email: "admin.azima@demo.onthebus.app",
  name: "Ada Okello",
  admin_role: "Super Admin",
};

const demoTenant = {
  id: TENANT_ID,
  name: "Azima Academy",
  domain: "azima-demo",
  is_demo: true,
  demo_expires_at: "2026-08-31T00:00:00.000Z",
  demo_request_id: REQUEST_ID,
};

const confirmedRequest = {
  id: REQUEST_ID,
  status: "confirmed",
  full_name: "Ada Okello",
  email: "ada@school.example",
  phone: "+254700000000",
  city: "Nairobi",
  school_name: "Azima Academy",
};

function mockFrom(handlers: Record<string, { data: unknown; error: unknown }>) {
  return vi.fn((table: string) => {
    const result = handlers[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.update = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.is = vi.fn(self);
    chain.maybeSingle = vi.fn(async () => result);
    chain.single = vi.fn(async () => result);
    return chain;
  });
}

describe("GET /api/demo/go-live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOperationalTenant).mockResolvedValue({
      ok: true,
      tenantId: TENANT_ID,
      client: {} as never,
    });
    vi.mocked(getCallerProfile).mockResolvedValue(schoolAdmin);
    vi.mocked(isDemoReadonly).mockReturnValue(false);
  });

  it("Given a paid school, When status is loaded, Then is_demo is false", async () => {
    const from = mockFrom({
      tenants: {
        data: { ...demoTenant, is_demo: false, domain: "azima", demo_request_id: null },
        error: null,
      },
    });
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await GET(new Request("http://localhost/api/demo/go-live"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.is_demo).toBe(false);
    expect(body.data.can_request_go_live).toBe(false);
  });
});

describe("POST /api/demo/go-live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOperationalTenant).mockResolvedValue({
      ok: true,
      tenantId: TENANT_ID,
      client: {} as never,
    });
    vi.mocked(getCallerProfile).mockResolvedValue(schoolAdmin);
    vi.mocked(isDemoReadonly).mockReturnValue(false);
    vi.mocked(notifyGoLiveRequested).mockResolvedValue(true);
  });

  it("Given a confirmed per-lead demo, When go live is requested, Then status becomes ready_to_onboard and sales is emailed", async () => {
    const updated = { ...confirmedRequest, status: DEMO_GO_LIVE_STATUS };
    let demoRequestReads = 0;
    const from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.update = vi.fn(self);
      chain.eq = vi.fn(self);
      chain.is = vi.fn(self);
      chain.maybeSingle = vi.fn(async () => {
        if (table === "tenants") return { data: demoTenant, error: null };
        demoRequestReads += 1;
        if (demoRequestReads === 1) return { data: confirmedRequest, error: null };
        return { data: updated, error: null };
      });
      return chain;
    });
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await POST(new Request("http://localhost/api/demo/go-live", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.go_live_requested).toBe(true);
    expect(body.data.demo_request_status).toBe(DEMO_GO_LIVE_STATUS);
    expect(notifyGoLiveRequested).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyGoLiveRequested).mock.calls[0][0]).toMatchObject({
      slug: "azima-demo",
      tenantId: TENANT_ID,
      schoolName: "Azima Academy",
      requestedByEmail: schoolAdmin.email,
    });
  });

  it("Given ready_to_onboard already, When go live is requested again, Then it succeeds without a second email", async () => {
    const from = mockFrom({
      tenants: { data: demoTenant, error: null },
      demo_requests: {
        data: { ...confirmedRequest, status: DEMO_GO_LIVE_STATUS },
        error: null,
      },
    });
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await POST(new Request("http://localhost/api/demo/go-live", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.already_requested).toBe(true);
    expect(notifyGoLiveRequested).not.toHaveBeenCalled();
  });

  it("Given a paid school, When go live is requested, Then the API returns 400", async () => {
    const from = mockFrom({
      tenants: {
        data: { ...demoTenant, is_demo: false, domain: "azima", demo_request_id: null },
        error: null,
      },
    });
    vi.mocked(getServiceSupabaseClient).mockReturnValue({ from } as never);

    const res = await POST(new Request("http://localhost/api/demo/go-live", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(notifyGoLiveRequested).not.toHaveBeenCalled();
  });
});
