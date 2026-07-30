import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { isValidTenantSlug } from "@/lib/tenantHost";

/**
 * Public resolve: map subdomain slug → school display info (no secrets).
 * Used by school login pages on {slug}.onthebusapp.com.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get("slug") || "").trim().toLowerCase();

    if (!slug || !isValidTenantSlug(slug)) {
      return NextResponse.json({ success: false, error: "Invalid school subdomain" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { id: "mock-tenant", name: `${slug} School`, domain: slug, status: "active" },
      });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const { data: tenant, error } = await adminClient
      .from("tenants")
      .select("id, name, domain, status")
      .eq("domain", slug)
      .is("deleted_at", null)
      .maybeSingle();

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
