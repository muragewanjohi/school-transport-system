import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const studentEq = vi.fn();
let studentCalls = 0;

function profilesQuery() {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle,
  };
  return api;
}

function studentsQuery() {
  const api: {
    select: () => typeof api;
    eq: (col?: string) => typeof api | Promise<{ data: unknown; error: null }>;
    is: () => typeof api;
    in: () => typeof api;
    update: () => typeof api;
  } = {
    select: () => api,
    is: () => api,
    in: () => api,
    update: () => api,
    eq: (col?: string) => {
      studentEq(col);
      if (col === "tenant_id") {
        studentCalls += 1;
        if (studentCalls === 1) {
          return Promise.resolve({
            data: [
              {
                id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                name: "Brian Demo",
                parent_id: PARENT_ID,
                tenant_id: TENANT_ID,
                guardians: [],
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
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
      if (table === "profiles") return profilesQuery();
      if (table === "students") return studentsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
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

import { GET } from "@/app/api/parent/children/route";
import { signParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function authRequest(token: string | null) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/parent/children", {
    method: "GET",
    headers,
  });
}

describe("GET /api/parent/children", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    maybeSingle.mockReset();
    studentEq.mockReset();
    studentCalls = 0;
    maybeSingle.mockResolvedValue({
      data: { id: PARENT_ID, phone: "+254724511201" },
      error: null,
    });
  });

  it("Given missing token, When requested, Then 401", async () => {
    const res = await GET(authRequest(null));
    expect(res.status).toBe(401);
  });

  it("Given valid parent token + linked children, When requested, Then 200 with those students", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await GET(authRequest(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      children: Array<{ name: string; parent_id: string }>;
      supabase_refresh_token?: string;
    };
    expect(body.success).toBe(true);
    expect(body.children).toHaveLength(1);
    expect(body.children[0]?.name).toBe("Brian Demo");
    expect(body.children[0]?.parent_id).toBe(PARENT_ID);
    expect(body.supabase_refresh_token).toBeUndefined();
  });

  it("Given bootstrap header, When requested, Then refresh token is returned", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("x-bootstrap-supabase", "1");
    const res = await GET(
      new Request("http://localhost/api/parent/children", { method: "GET", headers })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { supabase_refresh_token?: string };
    expect(body.supabase_refresh_token).toBe("refresh-test");
  });
});
