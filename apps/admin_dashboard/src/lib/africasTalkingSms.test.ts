import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AFRICASTALKING_LIVE_URL,
  AFRICASTALKING_SANDBOX_URL,
  africastalkingAccepted,
  getAfricasTalkingMessagingUrl,
  resolveOtpDelivery,
  sendAfricasTalkingSms,
  shouldDryRunOtpSms,
} from "@/lib/africasTalkingSms";

describe("getAfricasTalkingMessagingUrl › username › host", () => {
  it("Given sandbox, When resolving the host, Then the sandbox URL is used", () => {
    expect(getAfricasTalkingMessagingUrl("sandbox")).toBe(
      AFRICASTALKING_SANDBOX_URL
    );
  });

  it("Given a live username, When resolving the host, Then the live URL is used", () => {
    expect(getAfricasTalkingMessagingUrl("onthebus")).toBe(
      AFRICASTALKING_LIVE_URL
    );
  });
});

describe("shouldDryRunOtpSms › env › dry-run vs live", () => {
  it("Given sandbox username, When deciding delivery, Then SMS is dry-run", () => {
    expect(
      shouldDryRunOtpSms({
        atUsername: "sandbox",
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe(true);
  });

  it("Given live username in production, When deciding delivery, Then SMS is live", () => {
    expect(
      shouldDryRunOtpSms({
        atUsername: "onthebus",
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe(false);
  });

  it("Given OTP_SMS_DRY_RUN=false and live username, When local, Then SMS is live", () => {
    expect(
      shouldDryRunOtpSms({
        atUsername: "onthebus",
        nodeEnv: "development",
        otpSmsDryRun: "false",
      })
    ).toBe(false);
  });

  it("Given Vercel preview, When deciding delivery, Then SMS is dry-run", () => {
    expect(
      shouldDryRunOtpSms({
        atUsername: "onthebus",
        nodeEnv: "production",
        vercelEnv: "preview",
      })
    ).toBe(true);
  });
});

describe("resolveOtpDelivery › play-review › never SMS", () => {
  it("Given play-review, When resolving delivery, Then play_review even in production", () => {
    expect(
      resolveOtpDelivery({
        isPlayReview: true,
        atUsername: "onthebus",
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe("play_review");
  });
});

describe("africastalkingAccepted › recipient status › success vs reject", () => {
  it("Given Success recipient, When parsed, Then accepted", () => {
    expect(
      africastalkingAccepted({
        SMSMessageData: { Recipients: [{ status: "Success", statusCode: 101 }] },
      })
    ).toBe(true);
  });

  it("Given InvalidSenderId, When parsed, Then rejected", () => {
    expect(
      africastalkingAccepted({
        SMSMessageData: {
          Recipients: [{ status: "InvalidSenderId", statusCode: 403 }],
        },
      })
    ).toBe(false);
  });
});

describe("sendAfricasTalkingSms › live username › posts to live host", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given live credentials, When sending, Then the live host is called with username and to", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: "Success", statusCode: 101 }],
        },
      }),
    });

    await sendAfricasTalkingSms({
      to: "+254700000099",
      message: "OnTheBus: test",
      apiKey: "test-key",
      username: "onthebus",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(AFRICASTALKING_LIVE_URL);
    expect(String(init.body)).toContain("username=onthebus");
    expect(String(init.body)).toContain("to=%2B254700000099");
  });
});
