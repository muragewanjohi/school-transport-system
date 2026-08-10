import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getServiceSupabaseClient: vi.fn(() => null),
}));

import { POST } from "@/app/api/auth/driver-request-otp/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/driver-request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/driver-request-otp", () => {
  it("Given a valid driver phone, When OTP is requested, Then returns sandbox success", async () => {
    const response = await POST(jsonRequest({ phone: "+254700000001" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      source: "mock",
      sandbox_otp: "123456",
    });
  });

  it("Given an invalid phone, When OTP is requested, Then returns validation error", async () => {
    const response = await POST(jsonRequest({ phone: "123" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
  });
});
