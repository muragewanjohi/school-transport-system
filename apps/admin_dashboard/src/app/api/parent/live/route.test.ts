import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const limit = vi.fn();

function chain() {
  const api = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit,
    maybeSingle,
  };
  return api;
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: () => chain(),
  }),
}));

import { GET } from "@/app/api/parent/live/route";
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
  return new Request(`http://localhost/api/parent/live?student_id=${studentId}`, {
    method: "GET",
    headers,
  });
}

describe("GET /api/parent/live", () => {
  beforeEach(() => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    maybeSingle.mockReset();
    limit.mockReset();
  });

  it("GET /api/parent/live › missing token › returns 401", async () => {
    const res = await GET(authRequest(null));
    expect(res.status).toBe(401);
  });

  it("GET /api/parent/live › other parent's child › returns 403", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: STUDENT_ID,
          parent_id: OTHER_PARENT,
          tenant_id: TENANT_ID,
          route_id: ROUTE_ID,
          pickup_stop_id: STOP_ID,
          dropoff_stop_id: null,
          transit_status: "Present",
          guardians: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { phone: "+254700000000" },
        error: null,
      });

    const res = await GET(authRequest(token));
    expect(res.status).toBe(403);
  });

  it("GET /api/parent/live › in-progress trip with GPS › returns live bus", async () => {
    const token = signParentSession({ sub: PARENT_ID, tenant_id: TENANT_ID });
    maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: STUDENT_ID,
          parent_id: PARENT_ID,
          tenant_id: TENANT_ID,
          route_id: ROUTE_ID,
          pickup_stop_id: STOP_ID,
          dropoff_stop_id: null,
          transit_status: "pending",
          guardians: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { phone: "+254724511201" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { attendance: "boarded" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: STOP_ID, name: "Greenview Estate" },
        error: null,
      });

    limit
      .mockResolvedValueOnce({
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            status: "in_progress",
            schedule: { direction: "HOME_TO_SCHOOL" },
            vehicle: { license_plate: "KDD 123A" },
            driver: { name: "Jane Driver" },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            coordinates: { type: "Point", coordinates: [36.8, -1.27] },
            speed: 8.3,
            bearing: 90,
            is_emergency: false,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            stop_id: STOP_ID,
            predicted_arrival: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
            delay_seconds: 0,
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

    const res = await GET(authRequest(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trip_active).toBe(true);
    expect(body.transit_status).toBe("On the Bus");
    expect(body.attendance).toBe("boarded");
    expect(body.trip.vehicle_plate).toBe("KDD 123A");
    expect(body.live.lat).toBe(-1.27);
    expect(body.live.lng).toBe(36.8);
    expect(body.next_stop.name).toBe("Greenview Estate");
    expect(body.eta.eta_minutes).toBeGreaterThanOrEqual(7);
  });
});
