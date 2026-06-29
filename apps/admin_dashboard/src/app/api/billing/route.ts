import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

// Default Mock billing data
const mockBilling = {
  plan_name: "Pro",
  price_desc: "KES 10,000 / month + KES 1 / SMS",
  is_paid: false,
  students_count: 214,
  active_routes_count: 5,
  drivers_count: 6,
  sms_used_this_month: 16000,
  sms_limit_expected: 25000,
};

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockBilling });
    }

    const client = getSupabaseClient(token);

    // Fetch tenant from active user's profile
    let tenantId: string | null = null;
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: profile } = await client
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();
      tenantId = profile?.tenant_id || null;
    }

    // If no authenticated tenant found, fallback to first tenant in db
    if (!tenantId) {
      const { data: firstTenant } = await client
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      tenantId = firstTenant?.id || null;
    }

    if (!tenantId) {
      return NextResponse.json({ success: true, source: "fallback_no_tenant", data: mockBilling });
    }

    // Fetch billing details for the tenant
    let { data: billing, error } = await client
      .from("billing_status")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (error || !billing) {
      // If billing row not found, insert one
      const { data: insertedBilling, error: insertError } = await client
        .from("billing_status")
        .insert({
          tenant_id: tenantId,
          plan_name: "Pro",
          price_desc: "KES 10,000 / month + KES 1 / SMS",
          is_paid: false,
          students_count: 214,
          active_routes_count: 5,
          drivers_count: 6,
          sms_used_this_month: 16000,
          sms_limit_expected: 25000,
        })
        .select()
        .single();

      if (insertError) {
        console.warn("Could not insert default billing status, using mock:", insertError.message);
        return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockBilling });
      }
      billing = insertedBilling;
    }

    // Fetch dynamic real-time metrics to override default/static table values
    let studentsCount = billing.students_count;
    let routesCount = billing.active_routes_count;
    let driversCount = billing.drivers_count;
    let smsCount = billing.sms_used_this_month;

    try {
      const { count, error } = await client.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (!error && count !== null) studentsCount = count;
    } catch (e) {
      console.warn("Dynamic students count query failed:", e);
    }

    try {
      const { count, error } = await client.from("routes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (!error && count !== null) routesCount = count;
    } catch (e) {
      console.warn("Dynamic routes count query failed:", e);
    }

    try {
      const { count, error } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("role", "driver");
      if (!error && count !== null) driversCount = count;
    } catch (e) {
      console.warn("Dynamic drivers count query failed:", e);
    }

    try {
      const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const { count, error } = await client.from("sent_proximity_alerts").select("student_id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("trip_date", startOfMonthStr);
      if (!error && count !== null) smsCount = count;
    } catch (e) {
      console.warn("Dynamic SMS count query failed:", e);
    }

    const responseData = {
      ...billing,
      students_count: studentsCount,
      active_routes_count: routesCount,
      drivers_count: driversCount,
      sms_used_this_month: smsCount
    };

    return NextResponse.json({ success: true, source: "supabase", data: responseData });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { is_paid } = body;

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { is_paid } });
    }

    const client = getSupabaseClient(token);

    // Fetch tenant and admin role from active user's profile
    let tenantId: string | null = null;
    let adminRole: string | null = null;
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: profile } = await client
        .from("profiles")
        .select("tenant_id, admin_role")
        .eq("id", user.id)
        .single();
      tenantId = profile?.tenant_id || null;
      adminRole = profile?.admin_role || null;
    }

    // Fallback to first tenant if not explicitly authenticated (e.g. sandbox API call)
    if (!tenantId) {
      const { data: firstTenant } = await client
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      tenantId = firstTenant?.id || null;
    }

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active tenant found" }, { status: 400 });
    }

    // Server-side authorization check
    if (isSupabaseConfigured && adminRole) {
      const canManage = adminRole === "Super Admin" || adminRole === "Operations Admin" || adminRole === "Bursar";
      if (!canManage) {
        return NextResponse.json({ success: false, error: "Unauthorized: Insufficient privileges to update billing status" }, { status: 403 });
      }
    }

    // Update billing details for the tenant
    const { data: updatedBilling, error } = await client
      .from("billing_status")
      .update({ is_paid: !!is_paid, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.warn("Supabase billing update error, falling back to mock response:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { is_paid } });
    }

    return NextResponse.json({ success: true, source: "supabase", data: updatedBilling });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
