import { beforeEach, describe, expect, it, vi } from "vitest";

const updateEqStatus = vi.fn();
const updateIsStarted = vi.fn(() => Promise.resolve({ error: null }));
const updateEqId = vi.fn(() => ({
  eq: updateEqStatus,
}));
updateEqStatus.mockImplementation(() => ({
  is: updateIsStarted,
}));

const selectEqDate = vi.fn();
const selectEqStatus = vi.fn(() => ({
  is: vi.fn(() => Promise.resolve({ data: selectEqDate.mock.results.at(-1)?.value ?? [], error: null })),
}));

let tripRows: unknown[] = [];

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "trips") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, _val: string) => ({
            eq: () => ({
              is: async () => ({ data: tripRows, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: updateEqId,
        }),
      };
    },
  }),
}));

vi.mock("@/lib/authApi", () => ({
  getCallerProfile: vi.fn(async () => null),
  isPlatformSuperAdmin: vi.fn(() => false),
}));

import { GET } from "@/app/api/trips/predeparture-check/route";

function request(auth?: string) {
  const headers = new Headers();
  if (auth) headers.set("Authorization", auth);
  return new Request("http://localhost/api/trips/predeparture-check", {
    method: "GET",
    headers,
  });
}

describe("GET /api/trips/predeparture-check", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    tripRows = [];
    updateEqId.mockClear();
    updateEqStatus.mockClear();
    updateIsStarted.mockClear();
    updateIsStarted.mockResolvedValue({ error: null });
    updateEqStatus.mockImplementation(() => ({
      is: updateIsStarted,
    }));
  });

  it("Given missing cron bearer, When requested, Then 401", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("Given overdue scheduled trip, When cron runs, Then marks Delayed", async () => {
    // Fixed "now": make departure far in the past relative to real clock by using today's
    // date from Africa/Nairobi with a very early departure time.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    tripRows = [
      {
        id: "trip-overdue",
        tenant_id: "ten-1",
        status: "scheduled",
        started_at: null,
        status_override: null,
        custom_departure_time: null,
        trip_date: today,
        schedules: { departure_time: "00:01:00", name: "Morning" },
      },
    ];

    const res = await GET(request("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.marked).toBe(1);
    expect(body.data.marked_ids).toContain("trip-overdue");
    expect(updateEqId).toHaveBeenCalled();
  });

  it("Given already Delayed trip, When cron runs, Then skipped", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    tripRows = [
      {
        id: "trip-done",
        tenant_id: "ten-1",
        status: "scheduled",
        started_at: null,
        status_override: "Delayed",
        custom_departure_time: null,
        trip_date: today,
        schedules: { departure_time: "00:01:00", name: "Morning" },
      },
    ];

    const res = await GET(request("Bearer test-cron-secret"));
    const body = await res.json();
    expect(body.data.marked).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(updateEqId).not.toHaveBeenCalled();
  });
});
