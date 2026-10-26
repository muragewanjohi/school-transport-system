import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRIMARY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_TENANT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PARENT_PHONE = "+254701689463";

const db: { profiles: Row[]; students: Row[]; updates: Array<{ patch: Row; ids: string[] }> } = {
  profiles: [],
  students: [],
  updates: [],
};

/** Minimal PostgREST-style fake: applies eq / in / is filters to in-memory rows. */
function fakeQuery(table: "profiles" | "students") {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const run = () => {
    const rows = db[table].filter((row) => filters.every((f) => f(row)));
    if (patch) {
      for (const row of rows) Object.assign(row, patch);
      db.updates.push({ patch, ids: rows.map((r) => r.id as string) });
    }
    return rows;
  };
  const api = {
    select: () => api,
    update: (p: Row) => {
      patch = p;
      return api;
    },
    eq: (col: string, val: unknown) => {
      filters.push((row) => row[col] === val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((row) => vals.includes(row[col]));
      return api;
    },
    is: (col: string, val: unknown) => {
      filters.push((row) => (row[col] ?? null) === val);
      return api;
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: run().map((r) => ({ ...r })), error: null }).then(resolve),
  };
  return api;
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "profiles" || table === "students") return fakeQuery(table);
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

function authRequest(token: string | null, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/parent/children", { method: "GET", headers });
}

function student(id: string, name: string, parentId: string | null, guardianPhones: string[], tenantId = TENANT_ID): Row {
  return {
    id,
    name,
    parent_id: parentId,
    tenant_id: tenantId,
    guardians: guardianPhones.map((phone, i) => ({ name: `Guardian ${i}`, phone })),
  };
}

async function childrenFor(token: string) {
  const res = await GET(authRequest(token));
  const body = (await res.json()) as { success: boolean; children: Array<{ id: string; name: string }> };
  return { status: res.status, body };
}

describe("GET /api/parent/children", () => {
  const token = () => signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });

  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    db.profiles = [{ id: PARENT_ID, tenant_id: TENANT_ID, phone: PARENT_PHONE, name: "Caroline Mukami" }];
    db.students = [];
    db.updates = [];
  });

  it("Given missing token, When requested, Then 401", async () => {
    const res = await GET(authRequest(null));
    expect(res.status).toBe(401);
  });

  it("Given the parent is a student's parent_id, When requested, Then that student is returned", async () => {
    db.students = [student("s-1", "Brian Demo", PARENT_ID, [])];

    const { status, body } = await childrenFor(token());

    expect(status).toBe(200);
    expect(body.children.map((c) => c.name)).toEqual(["Brian Demo"]);
  });

  it("Given a secondary guardian (another parent is primary), When requested, Then the child is returned and the primary is kept", async () => {
    // Arrange: Brian's primary is Elizaphan; Caroline is 3rd guardian in local 07… format
    db.students = [student("s-1", "Brian Demo", PRIMARY_ID, ["+254724511201", "+254731437137", "0701689463"])];

    // Act
    const { status, body } = await childrenFor(token());

    // Assert
    expect(status).toBe(200);
    expect(body.children.map((c) => c.name)).toEqual(["Brian Demo"]);
    expect(db.students[0]?.parent_id).toBe(PRIMARY_ID);
    expect(db.updates).toHaveLength(0);
  });

  it("Given an unlinked student whose guardian phone matches, When requested, Then it is returned and linked to the parent", async () => {
    db.students = [student("s-2", "Ciru Demo", null, [PARENT_PHONE])];

    const { body } = await childrenFor(token());

    expect(body.children.map((c) => c.name)).toEqual(["Ciru Demo"]);
    expect(db.students[0]?.parent_id).toBe(PARENT_ID);
  });

  it("Given no student lists the parent's phone, When requested, Then the list is empty", async () => {
    db.students = [student("s-3", "Glen Demo", PRIMARY_ID, ["+254728581189"])];

    const { status, body } = await childrenFor(token());

    expect(status).toBe(200);
    expect(body.children).toEqual([]);
  });

  it("Given the same phone is a guardian in another school, When requested, Then that school's student is not returned", async () => {
    db.students = [student("s-4", "Other School Kid", PRIMARY_ID, [PARENT_PHONE], OTHER_TENANT)];

    const { body } = await childrenFor(token());

    expect(body.children).toEqual([]);
  });

  it("Given bootstrap header, When requested, Then refresh token is returned", async () => {
    const res = await GET(authRequest(token(), { "x-bootstrap-supabase": "1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { supabase_refresh_token?: string };
    expect(body.supabase_refresh_token).toBe("refresh-test");
  });
});
