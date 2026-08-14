import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { extractBearerToken, getCallerProfile } from "@/lib/authApi";
import { resolveRequestDb, verifyDriverSession } from "@/lib/driverSession";
import { parseHost } from "@/lib/tenantHost";

export type TenantDecisionInput = {
  role: string;
  profileTenantId: string | null;
  hostTenantId: string | null;
};

export type TenantDecision =
  | { ok: true; tenantId: string }
  | { ok: false; error: string };

export type OperationalTenantResult =
  | { ok: true; tenantId: string; client: SupabaseClient }
  | { ok: false; status: number; error: string };

export function decideOperationalTenant(input: TenantDecisionInput): TenantDecision {
  const { role, profileTenantId, hostTenantId } = input;

  if (role === "parent" || role === "driver" || role === "conductor") {
    return { ok: false, error: "This console is for school administrators only." };
  }

  if (role === "super_admin") {
    if (!hostTenantId) {
      return { ok: false, error: "Open the school subdomain to view that school's data." };
    }
    return { ok: true, tenantId: hostTenantId };
  }

  if (!profileTenantId) {
    return { ok: false, error: "Your account is not linked to a school." };
  }
  if (hostTenantId && hostTenantId !== profileTenantId) {
    return { ok: false, error: "You cannot view another school's data." };
  }
  return { ok: true, tenantId: profileTenantId };
}

export function hostSlugFromRequest(request: Request): string | null {
  const headerSlug = (request.headers.get("x-tenant-slug") || "").trim().toLowerCase();
  if (headerSlug) return headerSlug;
  const host = request.headers.get("x-request-host") || request.headers.get("host");
  return parseHost(host).slug;
}

export async function lookupTenantIdBySlug(slug: string): Promise<string | null> {
  const adminClient = getServiceSupabaseClient();
  if (!adminClient) return null;
  const { data } = await adminClient
    .from("tenants")
    .select("id")
    .eq("domain", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

export async function requireOperationalTenant(request: Request): Promise<OperationalTenantResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, status: 503, error: "Database is not configured" };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const driver = verifyDriverSession(token);
  if (driver) {
    const service = getServiceSupabaseClient();
    const client = service ?? getSupabaseClient(token);
    return { ok: true, tenantId: driver.tenant_id, client };
  }

  const db = await resolveRequestDb(request);
  if (!db) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const caller = await getCallerProfile(request);
  if (!caller) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const slug = hostSlugFromRequest(request);
  let hostTenantId: string | null = null;
  if (slug) {
    hostTenantId = await lookupTenantIdBySlug(slug);
    if (!hostTenantId) {
      return { ok: false, status: 404, error: "School not found for this subdomain." };
    }
  }

  const decided = decideOperationalTenant({
    role: caller.role,
    profileTenantId: caller.tenant_id,
    hostTenantId,
  });
  if (!decided.ok) {
    return { ok: false, status: 403, error: decided.error };
  }

  return { ok: true, tenantId: decided.tenantId, client: db.client };
}

export function tenantScopeError(result: Extract<OperationalTenantResult, { ok: false }>): NextResponse {
  return NextResponse.json({ success: false, error: result.error }, { status: result.status });
}
