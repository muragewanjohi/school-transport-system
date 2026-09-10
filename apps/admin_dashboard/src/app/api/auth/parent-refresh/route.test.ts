import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/parentAuthSession", () => ({
  ensureParentAuthSession: vi.fn().mockResolvedValue({
    supabase_access_token: "access-test",
    supabase_refresh_token: "refresh-test",
    supabase_expires_in: 3600,
    supabase_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }),
}));

import { POST } from "@/app/api/auth/parent-refresh/route";
import { signParentSession, verifyParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function authRequest(token: string, body?: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/parent-refresh", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe("POST /api/auth/parent-refresh › HMAC sliding session", () => {
  const prev = process.env.PARENT_SESSION_SECRET;

  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    maybeSingle.mockResolvedValue({
      data: { id: PARENT_ID, phone: "+254700000002", name: "Parent", email: null },
      error: null,
    });
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.PARENT_SESSION_SECRET;
    } else {
      process.env.PARENT_SESSION_SECRET = prev;
    }
  });

  it("Expired but signed parent HMAC can be refreshed within grace › 200 with a new par.* access_token", async () => {
    const expired = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID }, -60);
    expect(verifyParentSession(expired)).toBeNull();

    const res = await POST(authRequest(expired));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; access_token?: string };
    expect(json.success).toBe(true);
    expect(json.access_token?.startsWith("par.")).toBe(true);
    expect(json.access_token).not.toBe(expired);
    expect(verifyParentSession(json.access_token ?? "")).not.toBeNull();
  });

  it("Parent HMAC beyond grace is rejected › 401 Unauthorized", async () => {
    const tooOld = signParentSession(
      { sub: PARENT_ID, tenant_id: TENANT_ID },
      -(60 * 60 * 24 * 31)
    );
    const res = await POST(authRequest(tooOld));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it("Given a missing bearer token, When refreshed, Then 401", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/parent-refresh", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });
});
