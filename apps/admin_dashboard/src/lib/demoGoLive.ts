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

export function demoInboxBadgeCount(pendingCount: number): number {
  if (!Number.isFinite(pendingCount) || pendingCount <= 0) return 0;
  return Math.floor(pendingCount);
}

export type DemoStoreMeta = {
  domain: string | null;
  demo_expires_at: string | null;
};

export function enrichDemoRequestRow<
  T extends {
    id: string;
    provisioned_tenant_id?: string | null;
    demo_expires_at?: string | null;
  },
>(
  row: T,
  tenantById: Map<string, DemoStoreMeta>,
  tenantByRequestId: Map<string, DemoStoreMeta> = new Map()
): T & {
  demo_slug: string | null;
  demo_expires_at: string | null;
  demo_school_url: string | null;
} {
  const meta =
    (row.provisioned_tenant_id ? tenantById.get(row.provisioned_tenant_id) : undefined) ??
    tenantByRequestId.get(row.id);
  const domain = meta?.domain ?? null;
  return {
    ...row,
    demo_slug: domain,
    demo_expires_at: meta?.demo_expires_at ?? row.demo_expires_at ?? null,
    demo_school_url: domain ? `https://${domain}.onthebusapp.com/login` : null,
  };
}

export function demoRequestHasLiveStore(input: {
  provisionedTenantId?: string | null;
  demoSlug?: string | null;
  demoSchoolUrl?: string | null;
}): boolean {
  return Boolean(
    input.provisionedTenantId && (input.demoSlug || input.demoSchoolUrl)
  );
}

export function demoStoreRemovedLabel(status: string | null | undefined): string | null {
  if (status === "confirmed" || status === "ready_to_onboard") {
    return "Store removed";
  }
  return null;
}

export function formatDemoRequestStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function canEditDemoExpiry(
  status: string | null | undefined,
  provisionedTenantId: string | null | undefined
): boolean {
  return (
    (status === "confirmed" || status === "ready_to_onboard") &&
    Boolean(provisionedTenantId)
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local `datetime-local` value (YYYY-MM-DDTHH:mm) from an ISO timestamp. */
export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ISO timestamp from a `datetime-local` value. Returns null if empty or invalid. */
export function datetimeLocalValueToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Push expiry forward by `days`. If the current expiry is missing or already past,
 * count from `now` so an expired store can be revived before the daily purge.
 */
export function addDaysToDemoExpiry(
  currentIso: string | null | undefined,
  days: number,
  now: Date = new Date()
): string {
  const current = currentIso ? new Date(currentIso) : now;
  const base =
    Number.isNaN(current.getTime()) || current.getTime() < now.getTime() ? now : current;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
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
