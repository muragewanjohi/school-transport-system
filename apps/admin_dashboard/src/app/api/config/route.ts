import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

const mockConfig = {
  school_name: "Safaricom Track School",
  school_phone: "+254 700 000 000",
  school_email: "admin@safaricom-track.school",
  school_address: "Nairobi, Kenya",
  logo_url: "",
  geofence_radius_meters: 500,
  notify_on_trip_start: true,
  notify_on_geofence_entry: true,
  notify_on_boarded: true,
  sms_template_geofence: "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.",
  sms_template_boarded: "Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.",
  sms_template_trip_start: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.",
  sms_template_trip_status: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.",
  operating_hours_start: "06:00:00",
  operating_hours_end: "18:00:00",
  operating_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  holidays: [],
  sms_notifications_enabled: false,
  google_maps_api_key: "",
  mapbox_access_token: ""
};

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockConfig });
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
      return NextResponse.json({ success: true, source: "fallback_no_tenant", data: mockConfig });
    }

    // Fetch config details for the tenant
    let { data: config, error } = await client
      .from("tenant_configs")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (error || !config) {
      // If config row not found, insert default config
      const { data: insertedConfig, error: insertError } = await client
        .from("tenant_configs")
        .insert({
          tenant_id: tenantId,
          school_name: "Safaricom Track School",
          school_phone: "+254 700 000 000",
          school_email: "admin@safaricom-track.school",
          school_address: "Nairobi, Kenya",
          logo_url: "",
          geofence_radius_meters: 500,
          notify_on_trip_start: true,
          notify_on_geofence_entry: true,
          notify_on_boarded: true,
          sms_template_geofence: "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.",
          sms_template_boarded: "Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.",
          sms_template_trip_start: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.",
          sms_template_trip_status: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.",
          sms_notifications_enabled: false,
          mapbox_access_token: ""
        })
        .select()
        .single();

      if (insertError) {
        console.warn("Could not insert default config, using mock:", insertError.message);
        return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockConfig });
      }
      config = insertedConfig;
    }

    return NextResponse.json({ success: true, source: "supabase", data: config });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: body });
    }

    const client = getSupabaseClient(token);

    // Fetch tenant from active user's profile
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

    if (!tenantId) {
      // Fallback to first tenant if not explicitly authenticated (e.g. sandbox API call)
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

    // Role check: Only allow Super Admin and Operations Admin to edit configurations
    if (adminRole) {
      const canEdit = adminRole === "Super Admin" || adminRole === "Operations Admin";
      if (!canEdit) {
        return NextResponse.json({ success: false, error: "Unauthorized: Only Super Admin and Operations Admin can edit settings" }, { status: 403 });
      }
    }

    // Update settings for the tenant
    const { data: updatedConfig, error } = await client
      .from("tenant_configs")
      .upsert({
        tenant_id: tenantId,
        ...body,
        updated_at: new Date().toISOString()
      }, { onConflict: "tenant_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: updatedConfig });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
