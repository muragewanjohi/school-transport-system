import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const limit = vi.fn();
const order = vi.fn(() => ({ limit }));
const eqStop = vi.fn(() => ({ order }));
const eqRoute = vi.fn(() => ({ eq: eqStop }));
const selectEtas = vi.fn(() => ({ eq: eqRoute }));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "students") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        };
      }
      if (table === "trip_stop_etas") {
        return { select: selectEtas };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { GET } from "@/app/api/parent/etas/route";
import { signParentSession } from "@/lib/parentSession";

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PARENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STUDENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STOP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ROUTE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function authRequest(token: string | null, studentId = STUDENT_ID) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request(`http://localhost/api/parent/etas?student_id=${studentId}`, {
    method: "GET",
    headers,
  });
}

describe("GET /api/parent/etas", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    maybeSingle.mockReset();
    limit.mockReset();
    selectEtas.mockClear();
  });

  it("Given missing token, When requested, Then 401", async () => {
    const res = await GET(authRequest(null));
    expect(res.status).toBe(401);
  });

  it("Given valid parent token + own child with ETA, When requested, Then 200 with eta_minutes", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    maybeSingle.mockResolvedValue({
      data: {
        id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
        route_id: ROUTE_ID,
        pickup_stop_id: STOP_ID,
        dropoff_stop_id: null,
      },
      error: null,
    });
    const arrival = new Date(Date.now() + 12 * 60 * 1000).toISOString();
    limit.mockResolvedValue({
      data: [
        {
          stop_id: STOP_ID,
          route_id: ROUTE_ID,
          trip_id: "11111111-1111-4111-8111-111111111111",
          predicted_arrival: arrival,
          delay_seconds: 360,
          updated_at: new Date().toISOString(),
        },
      ],
      error: null,
    });

    const res = await GET(authRequest(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.eta.stop_id).toBe(STOP_ID);
    expect(body.eta.delay_seconds).toBe(360);
    expect(body.eta.eta_minutes).toBeGreaterThanOrEqual(11);
    expect(body.eta.eta_minutes).toBeLessThanOrEqual(13);
  });

  it("Given valid token but student of another parent, When requested, Then 403", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    maybeSingle.mockResolvedValue({
      data: {
        id: STUDENT_ID,
        parent_id: OTHER_PARENT,
        tenant_id: TENANT_ID,
        route_id: ROUTE_ID,
        pickup_stop_id: STOP_ID,
        dropoff_stop_id: null,
      },
      error: null,
    });

    const res = await GET(authRequest(token));
    expect(res.status).toBe(403);
  });

  it("Given invalid student_id, When requested, Then 400", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    const res = await GET(authRequest(token, "not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
