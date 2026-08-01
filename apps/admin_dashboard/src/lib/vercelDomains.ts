import { ROOT_DOMAIN } from "@/lib/tenantHost";

export interface VercelDomainResult {
  ok: boolean;
  skipped: boolean;
  detail: string;
}

/**
 * Best-effort removal of a school subdomain from the Vercel project.
 *
 * Requires VERCEL_TOKEN and VERCEL_PROJECT_ID (plus VERCEL_TEAM_ID for team
 * projects). When the project only uses the wildcard *.onthebusapp.com domain,
 * per-tenant domains don't exist in Vercel and the API returns 404, which we
 * treat as success.
 */
export async function removeTenantSubdomain(slug: string): Promise<VercelDomainResult> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return {
      ok: true,
      skipped: true,
      detail: "VERCEL_TOKEN / VERCEL_PROJECT_ID not configured; skipped Vercel domain removal",
    };
  }

  const domain = `${slug}.${ROOT_DOMAIN}`;
  const teamId = process.env.VERCEL_TEAM_ID;
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${query}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (res.ok || res.status === 404) {
      return {
        ok: true,
        skipped: false,
        detail: res.status === 404 ? `${domain} not registered in Vercel (wildcard covers it)` : `${domain} removed from Vercel`,
      };
    }

    const body = await res.text();
    return { ok: false, skipped: false, detail: `Vercel domain removal failed (${res.status}): ${body.slice(0, 300)}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, skipped: false, detail: `Vercel domain removal error: ${message}` };
  }
}
