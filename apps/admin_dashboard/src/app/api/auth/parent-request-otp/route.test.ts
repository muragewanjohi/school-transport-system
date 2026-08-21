import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: () => null,
}));

import { POST as parentRequestOtp } from "@/app/api/auth/parent-request-otp/route";
import { POST as driverRequestOtp } from "@/app/api/auth/driver-request-otp/route";

describe("POST /api/auth/parent-request-otp › unconfigured › mock OTP", () => {
  it("Given a valid phone without Supabase, When requested, Then mock sandbox_otp is returned", async () => {
    const res = await parentRequestOtp(
      new Request("http://localhost/api/auth/parent-request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+254700000002" }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; sandbox_otp?: string };
    expect(json.success).toBe(true);
    expect(json.sandbox_otp).toBe("123456");
  });

  it("Given a short phone, When requested, Then 400", async () => {
    const res = await parentRequestOtp(
      new Request("http://localhost/api/auth/parent-request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "12" }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/driver-request-otp › unconfigured › mock OTP", () => {
  it("Given a valid phone without Supabase, When requested, Then mock sandbox_otp is returned", async () => {
    const res = await driverRequestOtp(
      new Request("http://localhost/api/auth/driver-request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+254700000001" }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; sandbox_otp?: string };
    expect(json.success).toBe(true);
    expect(json.sandbox_otp).toBe("123456");
  });
});
