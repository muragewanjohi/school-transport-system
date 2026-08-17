import { DEMO_TENANT_SLUG, PLAY_REVIEW_TENANT_SLUG } from "@/lib/tenantHost";
import { PRICING_CONTACT_EMAIL } from "@/lib/pricingPlans";

export const DEMO_GO_LIVE_STATUS = "ready_to_onboard" as const;

export function goLiveNotifyEmail(): string {
  return process.env.GO_LIVE_NOTIFY_EMAIL || PRICING_CONTACT_EMAIL;
}

const NON_CONVERTIBLE_DEMO_SLUGS = new Set([
  DEMO_TENANT_SLUG,
  PLAY_REVIEW_TENANT_SLUG,
]);

export type GoLiveEligibility =
  | { ok: true }
  | { ok: false; reason: string; alreadyRequested?: boolean };

export function isConvertibleDemoSlug(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return !NON_CONVERTIBLE_DEMO_SLUGS.has(domain.trim().toLowerCase());
}

export function canRequestGoLive(input: {
  isDemo: boolean;
  domain: string | null;
  demoRequestId: string | null;
  requestStatus: string | null;
}): GoLiveEligibility {
  if (!input.isDemo) {
    return { ok: false, reason: "This school is not a demo account." };
  }
  if (!isConvertibleDemoSlug(input.domain)) {
    return {
      ok: false,
      reason: "This demo sandbox cannot be converted to a paid school.",
    };
  }
  if (!input.demoRequestId) {
    return { ok: false, reason: "This demo is not linked to a sales request." };
  }
  if (input.requestStatus === DEMO_GO_LIVE_STATUS) {
    return {
      ok: false,
      reason: "Your request to go live has already been sent.",
      alreadyRequested: true,
    };
  }
  if (input.requestStatus !== "confirmed") {
    return {
      ok: false,
      reason: "Go live can only be requested while the demo is active.",
    };
  }
  return { ok: true };
}

export function formatDemoRequestStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function formatDemoExpiryLabel(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) return "No expiry date set";
  const expires = new Date(iso);
  if (Number.isNaN(expires.getTime())) return "No expiry date set";
  const dateLabel = expires.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return expires.getTime() < now.getTime()
    ? `Expired ${dateLabel}`
    : `Expires ${dateLabel}`;
}

export function buildGoLiveNotifyEmail(payload: {
  schoolName: string;
  slug: string;
  tenantId: string;
  demoExpiresAt: string | null;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  leadCity: string | null;
  requestedByName: string;
  requestedByEmail: string;
}): { subject: string; text: string } {
  const expiry = payload.demoExpiresAt
    ? formatDemoExpiryLabel(payload.demoExpiresAt)
    : "No expiry date set";
  const subject = `Ready to onboard: ${payload.schoolName}`;
  const text = [
    `A demo school requested to go live.`,
    ``,
    `Status: ${DEMO_GO_LIVE_STATUS}`,
    `School: ${payload.schoolName}`,
    `Slug: ${payload.slug}`,
    `Tenant ID: ${payload.tenantId}`,
    `Demo expiry: ${expiry}`,
    ``,
    `Lead: ${payload.leadName}`,
    `Lead email: ${payload.leadEmail || "—"}`,
    `Lead phone: ${payload.leadPhone || "—"}`,
    `City: ${payload.leadCity || "—"}`,
    ``,
    `Requested by: ${payload.requestedByName} (${payload.requestedByEmail})`,
    ``,
    `Do not convert this demo tenant in place. Onboard a new paid school on a real slug, then complete/purge the demo store.`,
  ].join("\n");
  return { subject, text };
}
