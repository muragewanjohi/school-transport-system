import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issuePhoneOtp } from "@/lib/issuePhoneOtp";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

type TenantRow = { is_demo: boolean; domain: string } | null;

function mockClient(options: {
  profile: {
    id: string;
    tenant_id: string;
    status: string | null;
    otp_code: string | null;
  } | null;
  tenant: TenantRow;
  updateError?: { message: string } | null;
}) {
  const updateEq = vi.fn().mockResolvedValue({
    error: options.updateError ?? null,
  });

  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            in: () => ({
              or: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: options.profile,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: updateEq,
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.tenant, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    updateEq,
  };
}

describe("issuePhoneOtp › registered parent in production › live SMS, no sandbox_otp", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.AFRICASTALKING_USERNAME = "onthebus";
    process.env.AFRICASTALKING_API_KEY = "test-live-key";
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.OTP_SMS_DRY_RUN = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          SMSMessageData: {
            Recipients: [{ status: "Success", statusCode: 101 }],
          },
        }),
      })
    );
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.unstubAllGlobals();
  });

  it("Given a paid-school parent, When they request an OTP, Then AT is called and sandbox_otp is omitted", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      phone: "0700000099",
      roles: ["parent"],
      smsMessage: (otp) => `OnTheBus: Your parent app verification code is ${otp}.`,
      notRegisteredError: "not registered",
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.source).toBe("sms");
    expect(result.body.sandbox_otp).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("Given a demo tenant, When they request an OTP in production, Then AT is still called", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
      },
      tenant: { is_demo: true, domain: "acme-academy-demo" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      phone: "+254700000099",
      roles: ["driver", "conductor"],
      smsMessage: (otp) => `OnTheBus: Your driver app verification code is ${otp}.`,
      notRegisteredError: "not registered",
      enforceUnavailableStatus: true,
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("sms");
    expect(result.body.sandbox_otp).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("issuePhoneOtp › dry-run and play-review › no AT call", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.AFRICASTALKING_USERNAME = "sandbox";
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.OTP_SMS_DRY_RUN;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.unstubAllGlobals();
  });

  it("Given sandbox username, When they request an OTP, Then sandbox_otp is returned and AT is not called", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      phone: "+254700000099",
      roles: ["parent"],
      smsMessage: (otp) => otp,
      notRegisteredError: "not registered",
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("dev_sms_dry_run");
    expect(result.body.sandbox_otp).toMatch(/^\d{6}$/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Given play-review, When they request an OTP, Then 123456 is used and AT is not called", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: "123456",
      },
      tenant: { is_demo: true, domain: "play-review" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      phone: "+254700000002",
      roles: ["parent"],
      smsMessage: (otp) => otp,
      notRegisteredError: "not registered",
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("play_review");
    expect(result.body.sandbox_otp).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Given an unknown phone, When they request an OTP, Then 404", async () => {
    const client = mockClient({
      profile: null,
      tenant: null,
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      phone: "+254700000000",
      roles: ["parent"],
      smsMessage: (otp) => otp,
      notRegisteredError: "This phone number is not registered as a parent profile.",
      notRegisteredCode: "not_registered",
    });

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("not_registered");
    expect(fetch).not.toHaveBeenCalled();
  });
});
