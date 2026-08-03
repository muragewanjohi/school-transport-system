export const ROOT_DOMAIN = "onthebusapp.com";

/** Subdomains that must never resolve as school tenants (treated as apex) */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "platform",
  "admin",
  "api",
  "app",
  "static",
  "cdn",
  "mail",
  "smtp",
  "ftp",
]);

/**
 * Platform Demo School slug. Resolves as a real tenant host (`demo.onthebusapp.com`)
 * but must never be claimed during customer onboarding.
 */
export const DEMO_TENANT_SLUG = "demo";

/** Slugs blocked for new school onboarding (reserved apex + demo school) */
export const ONBOARDING_BLOCKED_SLUGS = new Set([
  ...RESERVED_SUBDOMAINS,
  DEMO_TENANT_SLUG,
]);

export type HostKind = "apex" | "tenant" | "local";

export type ParsedHost = {
  kind: HostKind;
  /** Tenant subdomain slug when kind === "tenant" */
  slug: string | null;
  hostname: string;
};

/**
 * Parse request Host into apex vs school subdomain.
 * Examples:
 * - onthebusapp.com / www.onthebusapp.com → apex
 * - school1.onthebusapp.com → tenant slug school1
 * - localhost:3000 → local
 */
export function parseHost(hostHeader: string | null): ParsedHost {
  const raw = (hostHeader || "").split(":")[0].trim().toLowerCase();
  if (!raw) {
    return { kind: "local", slug: null, hostname: "" };
  }

  if (raw === "localhost" || raw.endsWith(".localhost") || raw === "127.0.0.1") {
    return { kind: "local", slug: null, hostname: raw };
  }

  if (raw === ROOT_DOMAIN || raw === `www.${ROOT_DOMAIN}`) {
    return { kind: "apex", slug: null, hostname: raw };
  }

  const suffix = `.${ROOT_DOMAIN}`;
  if (raw.endsWith(suffix)) {
    const slug = raw.slice(0, -suffix.length);
    if (!slug || slug.includes(".") || RESERVED_SUBDOMAINS.has(slug)) {
      return { kind: "apex", slug: null, hostname: raw };
    }
    return { kind: "tenant", slug, hostname: raw };
  }

  // Preview / custom hosts (e.g. *.vercel.app) behave like local/apex for routing
  return { kind: "local", slug: null, hostname: raw };
}

export function getTenantPublicUrl(slug: string, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost")
      ? `http://${slug}.localhost:3000`
      : `https://${slug}.${ROOT_DOMAIN}`;
  return `${base.replace(/\/$/, "")}${normalized}`;
}

/**
 * Auth invite / recovery emails must land on the live school host.
 * Never use localhost here — invites are opened from real inboxes, and
 * Supabase falls back to Site URL when redirectTo is not allow-listed.
 */
export function getTenantInviteRedirectUrl(slug: string, path = "/reset-password"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `https://${slug}.${ROOT_DOMAIN}${normalized}`;
}

export function getApexPublicUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    // Prefer configured site URL (may be https://www.onthebusapp.com or https://onthebusapp.com)
    try {
      const u = new URL(configured);
      if (u.hostname.includes("localhost")) {
        return `http://localhost:3000${normalized}`;
      }
      return `${u.origin}${normalized}`;
    } catch {
      /* fall through */
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:3000${normalized}`;
  }
  return `https://www.${ROOT_DOMAIN}${normalized}`;
}

/** Console paths that belong on school subdomains, not the apex platform host */
export const SCHOOL_CONSOLE_PREFIXES = [
  "/dashboard",
  "/fleet",
  "/students",
  "/staff",
  "/routes",
  "/billing",
  "/config",
  "/users",
] as const;

export function isSchoolConsolePath(pathname: string): boolean {
  return SCHOOL_CONSOLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Platform-only paths (apex) */
export function isPlatformConsolePath(pathname: string): boolean {
  return pathname === "/schools" || pathname.startsWith("/schools/");
}

export function isValidTenantSlug(slug: string): boolean {
  return isTenantSlugSyntaxValid(slug) && !isOnboardingBlockedSlug(slug);
}

/** Syntax validation for resolving existing tenants, including the Demo School */
export function isTenantSlugSyntaxValid(slug: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug.length >= 2 &&
    slug.length <= 48
  );
}

export function isOnboardingBlockedSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  if (ONBOARDING_BLOCKED_SLUGS.has(normalized)) return true;
  // Per-lead demo stores use `{school}-demo`; never claimable for real schools
  if (normalized.endsWith("-demo")) return true;
  return false;
}
