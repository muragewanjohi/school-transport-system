import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issuePhoneOtp,
  isUsableOtpEmail,
  maskEmailHint,
} from "@/lib/issuePhoneOtp";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

type TenantRow = { is_demo: boolean; domain: string; contact_email?: string | null } | null;

vi.mock("@/lib/resendEmail", () => ({
  sendResendEmailWithId: vi.fn().mockResolvedValue({ ok: true, id: "em_1" }),
}));

import { sendResendEmailWithId } from "@/lib/resendEmail";

function mockClient(options: {
  profile: {
    id: string;
    tenant_id: string;
    status: string | null;
    otp_code: string | null;
    email?: string | null;
  } | null;
  tenant: TenantRow;
  updateError?: { message: string } | null;
  logError?: boolean;
}) {
  const updateEq = vi.fn().mockResolvedValue({
    error: options.updateError ?? null,
  });
  const logInserts: Array<Record<string, unknown>> = [];

  return {
    from: (table: string) => {
      if (table === "otp_delivery_log") {
        if (options.logError) throw new Error("log table unavailable");
        return {
          insert: async (row: Record<string, unknown>) => {
            logInserts.push(row);
            return { error: null };
          },
        };
      }
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
    logInserts,
  };
}

const baseInput = {
  phone: "0700000099",
  roles: ["parent"],
  smsMessage: (otp: string) => `SMS ${otp}`,
  emailMessage: (otp: string) => ({
    subject: "OTP",
    text: `Email ${otp}`,
  }),
  notRegisteredError: "not registered",
};

describe("maskEmailHint / isUsableOtpEmail", () => {
  it("masks local part", () => {
    expect(maskEmailHint("jane@gmail.com")).toBe("j***@gmail.com");
  });

  it("rejects synthetic emails", () => {
    expect(isUsableOtpEmail("parent+abc@users.onthebusapp.internal")).toBe(false);
    expect(isUsableOtpEmail("driver.azima-demo@demo.onthebus.app")).toBe(false);
    expect(isUsableOtpEmail("a@example.com")).toBe(false);
    expect(isUsableOtpEmail("real@school.ke")).toBe(true);
  });
});

describe("issuePhoneOtp › registered parent in production › live SMS, no sandbox_otp", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.AFRICASTALKING_USERNAME = "onthebus";
    process.env.AFRICASTALKING_API_KEY = "test-live-key";
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.OTP_SMS_DRY_RUN = "false";
    process.env.RESEND_API_KEY = "re_test";
    vi.mocked(sendResendEmailWithId).mockClear();
    vi.mocked(sendResendEmailWithId).mockResolvedValue({ ok: true, id: "em_1" });
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
        email: "parent@school.ke",
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.source).toBe("sms");
    expect(result.body.sandbox_otp).toBeUndefined();
    expect(result.body.email_hint).toBe("p***@school.ke");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sendResendEmailWithId).not.toHaveBeenCalled();
  });

  it("Given UserInBlacklist and email on file, When they request an OTP, Then email fallback succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          SMSMessageData: {
            Recipients: [{ status: "UserInBlacklist", statusCode: 406 }],
          },
        }),
      })
    );

    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: "jane@gmail.com",
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("email");
    expect(result.body.email_hint).toBe("j***@gmail.com");
    expect(sendResendEmailWithId).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendResendEmailWithId).mock.calls[0][0].to).toBe("jane@gmail.com");
  });

  it("Given UserInBlacklist and no email, When they request an OTP, Then 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          SMSMessageData: {
            Recipients: [{ status: "UserInBlacklist", statusCode: 406 }],
          },
        }),
      })
    );

    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: null,
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
    });

    expect(result.status).toBe(502);
    expect(result.body.success).toBe(false);
    expect(result.body.error).toMatch(/UserInBlacklist/);
    expect(sendResendEmailWithId).not.toHaveBeenCalled();
  });

  it("Given channel email and usable address, When requested, Then Resend only", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: "parent@school.ke",
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      channel: "email",
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("email");
    expect(fetch).not.toHaveBeenCalled();
    expect(sendResendEmailWithId).toHaveBeenCalledTimes(1);
  });

  it("Given channel email without address, When requested, Then 422", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: null,
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      channel: "email",
    });

    expect(result.status).toBe(422);
    expect(sendResendEmailWithId).not.toHaveBeenCalled();
  });

  it("Given a demo tenant, When they request an OTP in production, Then AT is still called", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: "d@school.ke",
      },
      tenant: { is_demo: true, domain: "acme-academy-demo" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      phone: "+254700000099",
      roles: ["driver", "conductor"],
      enforceUnavailableStatus: true,
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("sms");
    expect(result.body.sandbox_otp).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("Given a demo driver with a synthetic email, When AT rejects SMS, Then OTP is emailed to tenant contact_email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          SMSMessageData: {
            Recipients: [{ status: "UserInBlacklist", statusCode: 406 }],
          },
        }),
      })
    );

    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: "driver.azima-demo@demo.onthebus.app",
      },
      tenant: {
        is_demo: true,
        domain: "azima-demo",
        contact_email: "lead@school.ke",
      },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      phone: "+254700000099",
      roles: ["driver", "conductor"],
      enforceUnavailableStatus: true,
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("email");
    expect(result.body.email_hint).toBe("l***@school.ke");
    expect(sendResendEmailWithId).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendResendEmailWithId).mock.calls[0][0].to).toBe("lead@school.ke");
  });

  it("Given a demo driver with no lead email, When AT rejects SMS, Then 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          SMSMessageData: {
            Recipients: [{ status: "UserInBlacklist", statusCode: 406 }],
          },
        }),
      })
    );

    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: null,
        email: "driver.azima-demo@demo.onthebus.app",
      },
      tenant: {
        is_demo: true,
        domain: "azima-demo",
        contact_email: "admin.azima@demo.onthebus.app",
      },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      phone: "+254700000099",
      roles: ["driver", "conductor"],
    });

    expect(result.status).toBe(502);
    expect(result.body.success).toBe(false);
    expect(sendResendEmailWithId).not.toHaveBeenCalled();
  });
});

describe("issuePhoneOtp › dry-run and play-review › no AT call", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.AFRICASTALKING_USERNAME = "sandbox";
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.OTP_SMS_DRY_RUN;
    vi.mocked(sendResendEmailWithId).mockClear();
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
        email: "p@school.ke",
      },
      tenant: { is_demo: false, domain: "acme-academy" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      phone: "+254700000099",
      smsMessage: (otp) => otp,
      emailMessage: (otp) => ({ subject: "x", text: otp }),
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("dev_sms_dry_run");
    expect(result.body.sandbox_otp).toMatch(/^\d{6}$/);
    expect(fetch).not.toHaveBeenCalled();
    expect(sendResendEmailWithId).not.toHaveBeenCalled();
  });

  it("Given play-review, When they request an OTP, Then 123456 is used and AT is not called", async () => {
    const client = mockClient({
      profile: {
        id: PROFILE_ID,
        tenant_id: TENANT_ID,
        status: "Available",
        otp_code: "123456",
        email: "p@school.ke",
      },
      tenant: { is_demo: true, domain: "play-review" },
    });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, {
      ...baseInput,
      phone: "+254700000002",
      smsMessage: (otp) => otp,
      emailMessage: (otp) => ({ subject: "x", text: otp }),
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
      ...baseInput,
      phone: "+254700000000",
      notRegisteredError:
        "This phone number is not registered as a parent profile.",
      notRegisteredCode: "not_registered",
    });

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("not_registered");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("issuePhoneOtp › delivery log", () => {
  const envSnapshot = { ...process.env };
  const profile = {
    id: PROFILE_ID,
    tenant_id: TENANT_ID,
    role: "parent",
    status: "Available",
    otp_code: null,
    email: "jane@gmail.com",
  };
  const tenant = { is_demo: false, domain: "acme-academy" };

  function stubAt(recipient: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ SMSMessageData: { Recipients: [recipient] } }),
      })
    );
  }

  beforeEach(() => {
    process.env.AFRICASTALKING_USERNAME = "onthebus";
    process.env.AFRICASTALKING_API_KEY = "test-live-key";
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.OTP_SMS_DRY_RUN = "false";
    vi.mocked(sendResendEmailWithId).mockClear();
    vi.mocked(sendResendEmailWithId).mockResolvedValue({ ok: true, id: "em_1" });
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.unstubAllGlobals();
  });

  it("Given AT accepts the SMS, When an OTP is requested, Then one sms row is logged as sent with the messageId and no code", async () => {
    // Arrange
    stubAt({ status: "Success", statusCode: 101, messageId: "ATXid_1" });
    const client = mockClient({ profile, tenant });

    // Act
    const result = await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput });

    // Assert
    expect(result.status).toBe(200);
    expect(client.logInserts).toEqual([
      expect.objectContaining({
        tenant_id: TENANT_ID,
        profile_id: PROFILE_ID,
        role: "parent",
        channel: "sms",
        provider: "africastalking",
        provider_message_id: "ATXid_1",
        status: "sent",
        failure_reason: null,
        destination: "+254******099",
      }),
    ]);
    const smsBody = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body ?? "");
    const sentCode = new URLSearchParams(smsBody).get("message")?.match(/\d{6}/)?.[0] ?? "";
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(client.logInserts)).not.toContain(sentCode);
  });

  it("Given AT refuses with UserInBlacklist, When an OTP is requested, Then a failed sms row and a sent email row are logged", async () => {
    stubAt({ status: "UserInBlacklist", statusCode: 406 });
    const client = mockClient({ profile, tenant });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput });

    expect(result.body.source).toBe("email");
    expect(client.logInserts).toEqual([
      expect.objectContaining({ channel: "sms", status: "failed", failure_reason: "UserInBlacklist" }),
      expect.objectContaining({
        channel: "email",
        provider: "resend",
        provider_message_id: "em_1",
        status: "sent",
        destination: "j***@gmail.com",
      }),
    ]);
  });

  it("Given the parent asks for email, When the OTP is emailed, Then only an email row is logged", async () => {
    stubAt({ status: "Success", statusCode: 101, messageId: "ATXid_2" });
    const client = mockClient({ profile, tenant });

    await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput, channel: "email" });

    expect(fetch).not.toHaveBeenCalled();
    expect(client.logInserts).toHaveLength(1);
    expect(client.logInserts[0]).toMatchObject({ channel: "email", status: "sent" });
  });

  it("Given Resend refuses the email, When the parent asks for email, Then a failed email row is logged and 502 returned", async () => {
    vi.mocked(sendResendEmailWithId).mockResolvedValue({ ok: false, reason: "HTTP 422" });
    const client = mockClient({ profile, tenant });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput, channel: "email" });

    expect(result.status).toBe(502);
    expect(client.logInserts[0]).toMatchObject({ channel: "email", status: "failed", failure_reason: "HTTP 422" });
  });

  it("Given the log table is unavailable, When an OTP is requested, Then the OTP response is unchanged", async () => {
    stubAt({ status: "Success", statusCode: 101, messageId: "ATXid_3" });
    const client = mockClient({ profile, tenant, logError: true });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe("sms");
  });

  it("Given SMS dry-run, When an OTP is requested, Then nothing is logged", async () => {
    process.env.OTP_SMS_DRY_RUN = "true";
    stubAt({ status: "Success", statusCode: 101 });
    const client = mockClient({ profile, tenant });

    const result = await issuePhoneOtp(client as unknown as SupabaseClient, { ...baseInput });

    expect(result.body.sandbox_otp).toBeDefined();
    expect(client.logInserts).toHaveLength(0);
  });
});
