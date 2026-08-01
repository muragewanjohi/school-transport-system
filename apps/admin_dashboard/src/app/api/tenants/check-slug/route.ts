import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { isValidTenantSlug, RESERVED_SUBDOMAINS } from "@/lib/tenantHost";

/**
 * Platform-only: check whether a subdomain slug is free for onboarding.
 * Counts any non-deleted tenant (active or suspended) as taken, matching
 * the tenants_domain_active_unique index.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get("slug") || "").trim().toLowerCase();
    const excludeId = (searchParams.get("exclude_id") || "").trim();

    if (!slug) {
      return NextResponse.json({ success: false, error: "slug required" }, { status: 400 });
    }

    if (RESERVED_SUBDOMAINS.has(slug)) {
      return NextResponse.json({
        success: true,
        data: { slug, valid: false, available: false, reason: "reserved" },
      });
    }

    if (!isValidTenantSlug(slug)) {
      return NextResponse.json({
        success: true,
        data: { slug, valid: false, available: false, reason: "invalid" },
      });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { slug, valid: true, available: slug !== "safaricom-track", reason: null },
      });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    let query = adminClient
      .from("tenants")
      .select("id")
      .eq("domain", slug)
      .is("deleted_at", null);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: { slug, valid: true, available: !data, reason: data ? "taken" : null },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
