import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/driver-refresh/route";
import { signDriverSession, verifyDriverSession } from "@/lib/driverSession";

const DRIVER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VEHICLE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function authRequest(token: string) {
  return new Request("http://localhost/api/auth/driver-refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("POST /api/auth/driver-refresh › HMAC sliding session", () => {
  const prev = process.env.DRIVER_SESSION_SECRET;

  beforeEach(() => {
    process.env.DRIVER_SESSION_SECRET = "unit-test-driver-secret";
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.DRIVER_SESSION_SECRET;
    } else {
      process.env.DRIVER_SESSION_SECRET = prev;
    }
  });

  it("Expired but signed driver HMAC can be refreshed within grace › 200 with a new drv.* access_token", async () => {
    const expired = signDriverSession(
      {
        sub: DRIVER_ID,
        tenant_id: TENANT_ID,
        role: "driver",
        vehicle_id: VEHICLE_ID,
      },
      -60
    );
    expect(verifyDriverSession(expired)).toBeNull();

    const res = await POST(authRequest(expired));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; access_token?: string };
    expect(json.success).toBe(true);
    expect(json.access_token?.startsWith("drv.")).toBe(true);
    expect(json.access_token).not.toBe(expired);
    const payload = verifyDriverSession(json.access_token ?? "");
    expect(payload?.sub).toBe(DRIVER_ID);
    expect(payload?.vehicle_id).toBe(VEHICLE_ID);
  });

  it("Driver HMAC beyond grace is rejected › 401", async () => {
    const tooOld = signDriverSession(
      {
        sub: DRIVER_ID,
        tenant_id: TENANT_ID,
        role: "driver",
        vehicle_id: VEHICLE_ID,
      },
      -(60 * 60 * 24 * 31)
    );
    const res = await POST(authRequest(tooOld));
    expect(res.status).toBe(401);
  });

  it("Given a missing bearer token, When refreshed, Then 401", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/driver-refresh", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });
});
