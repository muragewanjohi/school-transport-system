import { describe, expect, it } from "vitest";
import {
  DEMO_GO_LIVE_STATUS,
  buildGoLiveNotifyEmail,
  canRequestGoLive,
  formatDemoExpiryLabel,
  goLiveNotifyEmail,
} from "@/lib/demoGoLive";

const CONFIRMED = {
  isDemo: true,
  domain: "azima-demo",
  demoRequestId: "c7ba705a-d6ae-477c-a802-c06951ef2136",
  requestStatus: "confirmed",
};

describe("canRequestGoLive", () => {
  it("Given a confirmed per-lead demo, When eligibility is evaluated, Then go live is allowed", () => {
    expect(canRequestGoLive(CONFIRMED)).toEqual({ ok: true });
  });

  it("Given play-review, When eligibility is evaluated, Then go live is refused", () => {
    const result = canRequestGoLive({
      ...CONFIRMED,
      domain: "play-review",
    });
    expect(result.ok).toBe(false);
  });

  it("Given the static demo sandbox, When eligibility is evaluated, Then go live is refused", () => {
    const result = canRequestGoLive({
      ...CONFIRMED,
      domain: "demo",
    });
    expect(result.ok).toBe(false);
  });

  it("Given a paid school, When eligibility is evaluated, Then go live is refused", () => {
    const result = canRequestGoLive({
      ...CONFIRMED,
      isDemo: false,
      domain: "azima",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not a demo/i);
  });

  it("Given ready_to_onboard, When eligibility is evaluated, Then alreadyRequested is set", () => {
    const result = canRequestGoLive({
      ...CONFIRMED,
      requestStatus: DEMO_GO_LIVE_STATUS,
    });
    expect(result).toMatchObject({ ok: false, alreadyRequested: true });
  });
});

describe("formatDemoExpiryLabel", () => {
  it("Given 31 Aug 2026, When formatted on 17 Aug 2026, Then it reads Expires 31 August 2026", () => {
    expect(
      formatDemoExpiryLabel("2026-08-31T00:00:00.000Z", new Date("2026-08-17T12:00:00.000Z"))
    ).toBe("Expires 31 August 2026");
  });

  it("Given a past expiry, When formatted, Then it reads Expired", () => {
    expect(
      formatDemoExpiryLabel("2026-08-01T00:00:00.000Z", new Date("2026-08-17T12:00:00.000Z"))
    ).toBe("Expired 1 August 2026");
  });

  it("Given a missing expiry, When formatted, Then it says no expiry date set", () => {
    expect(formatDemoExpiryLabel(null)).toBe("No expiry date set");
  });
});

describe("buildGoLiveNotifyEmail", () => {
  it("Given a go-live request, When the sales email is built, Then it targets ready to onboard and includes expiry", () => {
    const email = buildGoLiveNotifyEmail({
      schoolName: "Azima Academy",
      slug: "azima-demo",
      tenantId: "4e562c76-4e98-40bd-9d22-7b6e992c4b49",
      demoExpiresAt: "2026-08-31T00:00:00.000Z",
      leadName: "Ada Okello",
      leadEmail: "ada@school.example",
      leadPhone: "+254700000000",
      leadCity: "Nairobi",
      requestedByName: "Ada Okello",
      requestedByEmail: "admin.azima@demo.onthebus.app",
    });
    expect(email.subject).toBe("Ready to onboard: Azima Academy");
    expect(email.text).toContain(DEMO_GO_LIVE_STATUS);
    expect(email.text).toContain("azima-demo");
    expect(email.text).toContain("Expires 31 August 2026");
  });

  it("Given default env, When the notify inbox is resolved, Then it is info@onthebusapp.com", () => {
    expect(goLiveNotifyEmail()).toBe("info@onthebusapp.com");
  });
});
