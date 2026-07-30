export const ROOT_DOMAIN = "onthebusapp.com";

/** Subdomains that must never resolve as school tenants */
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

export function getApexPublicUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost")) {
    return `http://localhost:3000${normalized}`;
  }
  return `https://${ROOT_DOMAIN}${normalized}`;
}

export function isValidTenantSlug(slug: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug.length >= 2 &&
    slug.length <= 48 &&
    !RESERVED_SUBDOMAINS.has(slug)
  );
}
