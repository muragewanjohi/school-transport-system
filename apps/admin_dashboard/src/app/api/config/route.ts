import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getCallerProfile } from "@/lib/authApi";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { clampMinStopDwellSeconds } from "@/lib/stopVisitOutcome";
import {
  DEFAULT_ABSENT_CAMPUS_TEMPLATE,
  DEFAULT_ABSENT_STOP_TEMPLATE,
} from "@/lib/absentParentAlert";
import {
  generateProvisionPin,
  hashProvisionPin,
  sanitizeTenantConfigForClient,
} from "@/lib/beaconProvision";

const mockConfig = {
  school_name: "Safaricom Track School",
  school_phone: "+254 700 000 000",
  school_email: "admin@safaricom-track.school",
  school_address: "Nairobi, Kenya",
  logo_url: "",
  geofence_radius_meters: 500,
  min_stop_dwell_seconds: 90,
  notify_on_trip_start: true,
  notify_on_geofence_entry: true,
  notify_on_boarded: true,
  notify_on_absent_stop: true,
  notify_on_absent_campus: true,
  sms_template_geofence: "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.",
  sms_template_boarded: "Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.",
  sms_template_trip_start: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.",
  sms_template_trip_status: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.",
  sms_template_campus_exit: "Hi {parent_name}, Bus {vehicle_plate} has left school. {student_name} will be {action} at {stop_name} around {eta_time} (about {duration_mins} min).",
  sms_template_absent_stop: DEFAULT_ABSENT_STOP_TEMPLATE,
  sms_template_absent_campus: DEFAULT_ABSENT_CAMPUS_TEMPLATE,
  operating_hours_start: "06:00:00",
  operating_hours_end: "18:00:00",
  operating_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  holidays: [],
  sms_notifications_enabled: false,
  google_maps_api_key: "",
  mapbox_access_token: "",
  beacon_provision_pin_configured: false,
};

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockConfig });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

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
          min_stop_dwell_seconds: 90,
          notify_on_trip_start: true,
          notify_on_geofence_entry: true,
          notify_on_boarded: true,
          notify_on_absent_stop: true,
          notify_on_absent_campus: true,
          sms_template_geofence: "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.",
          sms_template_boarded: "Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.",
          sms_template_trip_start: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.",
          sms_template_trip_status: "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.",
          sms_template_absent_stop: DEFAULT_ABSENT_STOP_TEMPLATE,
          sms_template_absent_campus: DEFAULT_ABSENT_CAMPUS_TEMPLATE,
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

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: sanitizeTenantConfigForClient(config as Record<string, unknown>),
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      if (body.rotate_beacon_provision_pin === true) {
        const pin = generateProvisionPin();
        return NextResponse.json({
          success: true,
          source: "mock",
          data: {
            ...mockConfig,
            beacon_provision_pin_configured: true,
          },
          provision_pin: pin,
        });
      }
      return NextResponse.json({
        success: true,
        source: "mock",
        data: sanitizeTenantConfigForClient({ ...mockConfig, ...body }),
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;
    const caller = await getCallerProfile(request);
    const adminRole = caller?.admin_role || null;

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

    if (body.rotate_beacon_provision_pin === true) {
      const pin = generateProvisionPin();
      const { data: updatedConfig, error } = await client
        .from("tenant_configs")
        .upsert(
          {
            tenant_id: tenantId,
            beacon_provision_pin_hash: hashProvisionPin(pin),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        )
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        source: "supabase",
        data: sanitizeTenantConfigForClient(updatedConfig as Record<string, unknown>),
        provision_pin: pin,
      });
    }

    const minDwell = clampMinStopDwellSeconds(
      typeof body.min_stop_dwell_seconds === "number" ? body.min_stop_dwell_seconds : undefined
    );

    const {
      rotate_beacon_provision_pin: _rotate,
      beacon_provision_pin_hash: _hash,
      beacon_device_password_enc: _enc,
      beacon_provision_pin_configured: _configured,
      provision_pin: _plain,
      mapbox_access_token: _mapbox,
      ...safeBody
    } = body;

    // Update settings for the tenant
    const { data: updatedConfig, error } = await client
      .from("tenant_configs")
      .upsert({
        tenant_id: tenantId,
        ...safeBody,
        min_stop_dwell_seconds: minDwell,
        updated_at: new Date().toISOString()
      }, { onConflict: "tenant_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: sanitizeTenantConfigForClient(updatedConfig as Record<string, unknown>),
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
