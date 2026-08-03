import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { isTenantSlugSyntaxValid } from "@/lib/tenantHost";

/**
 * Public resolve: map subdomain slug → school display info (no secrets),
 * or tenant_id → slug (for apex → subdomain redirects).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get("slug") || "").trim().toLowerCase();
    const tenantId = (searchParams.get("tenant_id") || "").trim();

    if (!slug && !tenantId) {
      return NextResponse.json({ success: false, error: "slug or tenant_id required" }, { status: 400 });
    }

    if (slug && !isTenantSlugSyntaxValid(slug)) {
      return NextResponse.json({ success: false, error: "Invalid school subdomain" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          id: tenantId || "mock-tenant",
          name: `${slug || "demo"} School`,
          domain: slug || "safaricom-track",
          status: "active",
        },
      });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    let query = adminClient
      .from("tenants")
      .select("id, name, domain, status")
      .is("deleted_at", null);

    if (slug) {
      query = query.eq("domain", slug);
    } else {
      query = query.eq("id", tenantId);
    }

    const { data: tenant, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!tenant || tenant.status !== "active") {
      return NextResponse.json({ success: false, error: "School not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: tenant });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
