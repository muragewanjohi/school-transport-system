import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const delEq = vi.fn();

function tokensQuery() {
  const api = {
    upsert,
    delete: () => api,
    eq: (...args: unknown[]) => {
      delEq(...args);
      return api;
    },
  };
  return api;
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "user_fcm_tokens") return tokensQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { DELETE, POST } from "@/app/api/parent/fcm-tokens/route";
import { signParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "fcm-device-token-abcdefghij";

function authRequest(token: string | null, method: string, body?: unknown) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/parent/fcm-tokens", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/parent/fcm-tokens", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
  });

  it("Given missing token, When registering FCM, Then 401", async () => {
    const res = await POST(authRequest(null, "POST", { token: TOKEN, device_type: "android" }));
    expect(res.status).toBe(401);
  });

  it("Given valid parent session, When registering FCM, Then upserts for that parent", async () => {
    const session = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await POST(authRequest(session, "POST", { token: TOKEN, device_type: "android" }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: PARENT_ID,
        token: TOKEN,
        device_type: "android",
      }),
      { onConflict: "user_id,token" }
    );
  });
});

describe("DELETE /api/parent/fcm-tokens", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    delEq.mockReset();
  });

  it("Given missing token, When unregistering FCM, Then 401", async () => {
    const res = await DELETE(authRequest(null, "DELETE", { token: TOKEN }));
    expect(res.status).toBe(401);
  });
});
