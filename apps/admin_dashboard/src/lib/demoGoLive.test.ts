import { describe, expect, it } from "vitest";
import {
  DEMO_GO_LIVE_STATUS,
  addDaysToDemoExpiry,
  buildGoLiveNotifyEmail,
  canEditDemoExpiry,
  canRequestGoLive,
  datetimeLocalValueToIso,
  enrichDemoRequestRow,
  demoInboxBadgeCount,
  demoRequestHasLiveStore,
  demoStoreRemovedLabel,
  formatDemoExpiryLabel,
  goLiveNotifyEmail,
  isoToDatetimeLocalValue,
} from "@/lib/demoGoLive";

const CONFIRMED = {
  isDemo: true,
  domain: "azima-demo",
  demoRequestId: "c7ba705a-d6ae-477c-a802-c06951ef2136",
  requestStatus: "confirmed",
};

describe("demoInboxBadgeCount", () => {
  it("Given pending leads, When the badge is computed, Then only pending count is used", () => {
    expect(demoInboxBadgeCount(2)).toBe(2);
  });

  it("Given an approved or ready-to-onboard inbox with no pending, When the badge is computed, Then it is 0", () => {
    expect(demoInboxBadgeCount(0)).toBe(0);
  });
});

describe("enrichDemoRequestRow", () => {
  it("Given a linked tenant, When the request is enriched, Then slug URL and tenant expiry are visible", () => {
    const row = enrichDemoRequestRow(
      {
        id: "req-1",
        provisioned_tenant_id: "tenant-1",
        demo_expires_at: "2026-08-20T00:00:00.000Z",
      },
      new Map([
        [
          "tenant-1",
          { domain: "azima-demo", demo_expires_at: "2026-09-15T12:00:00.000Z" },
        ],
      ])
    );
    expect(row.demo_slug).toBe("azima-demo");
    expect(row.demo_school_url).toBe("https://azima-demo.onthebusapp.com/login");
    expect(row.demo_expires_at).toBe("2026-09-15T12:00:00.000Z");
    expect(
      demoRequestHasLiveStore({
        provisionedTenantId: row.provisioned_tenant_id,
        demoSlug: row.demo_slug,
        demoSchoolUrl: row.demo_school_url,
      })
    ).toBe(true);
  });

  it("Given a purged tenant, When the request is enriched, Then the stored request expiry remains and the store is marked removed", () => {
    const row = enrichDemoRequestRow(
      {
        id: "req-1",
        provisioned_tenant_id: null,
        demo_expires_at: "2026-08-24T00:00:00.000Z",
      },
      new Map()
    );
    expect(row.demo_slug).toBeNull();
    expect(row.demo_school_url).toBeNull();
    expect(row.demo_expires_at).toBe("2026-08-24T00:00:00.000Z");
    expect(demoStoreRemovedLabel("ready_to_onboard")).toBe("Store removed");
    expect(
      demoRequestHasLiveStore({
        provisionedTenantId: row.provisioned_tenant_id,
        demoSlug: row.demo_slug,
        demoSchoolUrl: row.demo_school_url,
      })
    ).toBe(false);
  });
});

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

describe("canEditDemoExpiry", () => {
  it("Given confirmed or ready_to_onboard with a tenant, When checked, Then expiry can be edited", () => {
    expect(canEditDemoExpiry("confirmed", "tenant-1")).toBe(true);
    expect(canEditDemoExpiry("ready_to_onboard", "tenant-1")).toBe(true);
  });

  it("Given pending or no tenant, When checked, Then expiry cannot be edited", () => {
    expect(canEditDemoExpiry("pending", "tenant-1")).toBe(false);
    expect(canEditDemoExpiry("confirmed", null)).toBe(false);
    expect(canEditDemoExpiry("completed", "tenant-1")).toBe(false);
  });
});

describe("datetime-local expiry values", () => {
  it("Given an ISO timestamp, When converted to datetime-local and back, Then the instant is preserved", () => {
    const local = new Date(2026, 8, 15, 18, 30, 0);
    const iso = local.toISOString();
    expect(isoToDatetimeLocalValue(iso)).toBe("2026-09-15T18:30");
    expect(datetimeLocalValueToIso("2026-09-15T18:30")).toBe(iso);
  });
});

describe("addDaysToDemoExpiry", () => {
  const now = new Date("2026-08-28T06:00:00.000Z");

  it("Given a future expiry, When extended by 14 days, Then 14 days are added to the current expiry", () => {
    expect(addDaysToDemoExpiry("2026-09-01T00:00:00.000Z", 14, now)).toBe(
      "2026-09-15T00:00:00.000Z"
    );
  });

  it("Given a past expiry, When extended by 14 days, Then 14 days are added from now", () => {
    expect(addDaysToDemoExpiry("2026-08-20T00:00:00.000Z", 14, now)).toBe(
      "2026-09-11T06:00:00.000Z"
    );
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
