import { afterEach, describe, expect, it } from "vitest";
import { signParentSession, verifyParentSession } from "@/lib/parentSession";

describe("parentSession › sign/verify", () => {
  const prev = process.env.PARENT_SESSION_SECRET;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.PARENT_SESSION_SECRET;
    } else {
      process.env.PARENT_SESSION_SECRET = prev;
    }
  });

  it("Given a parent payload, When signed, Then token starts with par. and verifies", () => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    const token = signParentSession({
      sub: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(token.startsWith("par.")).toBe(true);
    const payload = verifyParentSession(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload?.tenant_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(payload?.role).toBe("parent");
  });

  it("Given a tampered signature, When verified, Then null", () => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    const token = signParentSession({
      sub: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
    });
    const parts = token.split(".");
    parts[2] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(verifyParentSession(parts.join("."))).toBeNull();
  });

  it("Given a driver token prefix, When verified as parent, Then null", () => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    expect(verifyParentSession("drv.abc.def")).toBeNull();
  });

  it("Given an expired payload, When verified, Then null", () => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    const token = signParentSession(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        tenant_id: "22222222-2222-4222-8222-222222222222",
      },
      -10
    );
    expect(verifyParentSession(token)).toBeNull();
  });

  it("Given an expired payload within grace, When verified with grace, Then payload", () => {
    process.env.PARENT_SESSION_SECRET = "unit-test-parent-secret";
    const token = signParentSession(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        tenant_id: "22222222-2222-4222-8222-222222222222",
      },
      -60
    );
    const payload = verifyParentSession(token, { expiredGraceSeconds: 120 });
    expect(payload?.sub).toBe("11111111-1111-4111-8111-111111111111");
  });
});
