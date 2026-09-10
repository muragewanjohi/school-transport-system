import { afterEach, describe, expect, it } from "vitest";
import { signDriverSession, verifyDriverSession } from "@/lib/driverSession";

describe("driverSession › sign/verify", () => {
  const prev = process.env.DRIVER_SESSION_SECRET;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.DRIVER_SESSION_SECRET;
    } else {
      process.env.DRIVER_SESSION_SECRET = prev;
    }
  });

  it("Given a driver payload, When signed, Then token starts with drv. and verifies", () => {
    process.env.DRIVER_SESSION_SECRET = "unit-test-driver-secret";
    const token = signDriverSession({
      sub: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      role: "driver",
      vehicle_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(token.startsWith("drv.")).toBe(true);
    const payload = verifyDriverSession(token);
    expect(payload?.sub).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload?.role).toBe("driver");
  });

  it("Given an expired payload, When verified, Then null", () => {
    process.env.DRIVER_SESSION_SECRET = "unit-test-driver-secret";
    const token = signDriverSession(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        tenant_id: "22222222-2222-4222-8222-222222222222",
        role: "driver",
        vehicle_id: null,
      },
      -10
    );
    expect(verifyDriverSession(token)).toBeNull();
  });

  it("Given an expired payload within grace, When verified with grace, Then payload", () => {
    process.env.DRIVER_SESSION_SECRET = "unit-test-driver-secret";
    const token = signDriverSession(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        tenant_id: "22222222-2222-4222-8222-222222222222",
        role: "conductor",
        vehicle_id: null,
      },
      -60
    );
    const payload = verifyDriverSession(token, { expiredGraceSeconds: 120 });
    expect(payload?.role).toBe("conductor");
  });
});
