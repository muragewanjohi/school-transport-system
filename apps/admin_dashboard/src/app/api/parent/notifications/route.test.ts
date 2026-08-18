import { beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
const notificationsEq = vi.fn();

function notificationsQuery() {
  const api = {
    select: () => api,
    eq: (...args: unknown[]) => {
      notificationsEq(...args);
      return api;
    },
    order: () => api,
    limit,
    update: () => api,
    in: () => api,
  };
  return api;
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "notifications") return notificationsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { GET, PATCH } from "@/app/api/parent/notifications/route";
import { signParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function authRequest(token: string | null, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/parent/notifications", {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
  });
}

describe("GET /api/parent/notifications", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    limit.mockReset();
    notificationsEq.mockReset();
  });

  it("Given missing token, When requested, Then 401", async () => {
    const res = await GET(authRequest(null));
    expect(res.status).toBe(401);
  });

  it("Given valid parent token, When requested, Then 200 scoped to parent id and tenant", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    limit.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Bus left school",
          message: "ETA 12 mins",
          notification_type: "eta",
          read: false,
          created_at: "2026-08-18T12:00:00.000Z",
        },
      ],
      error: null,
    });

    const res = await GET(authRequest(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.unread_count).toBe(1);
    expect(body.notifications[0].title).toBe("Bus left school");
    expect(notificationsEq).toHaveBeenCalledWith("user_id", PARENT_ID);
    expect(notificationsEq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
  });
});

describe("PATCH /api/parent/notifications", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    notificationsEq.mockReset();
    limit.mockReset();
  });

  it("Given missing token, When marking read, Then 401", async () => {
    const res = await PATCH(authRequest(null, { method: "PATCH", body: JSON.stringify({ all: true }) }));
    expect(res.status).toBe(401);
  });
});
