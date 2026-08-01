import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { PLATFORM_SETTING_DEFAULTS, readPlatformNumberSettings } from "@/lib/platformSettings";

const updateSettingsSchema = z.object({
  default_campus_monthly_fee_kes: z.number().int().min(0).optional(),
  // Days a suspended school is kept before auto soft-delete; 0 disables
  suspended_purge_days: z.number().int().min(0).max(3650).optional(),
  // Days a soft-deleted school is kept before permanent purge; 0 disables
  deleted_purge_days: z.number().int().min(0).max(3650).optional(),
});

const DEFAULTS = PLATFORM_SETTING_DEFAULTS;

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { ...DEFAULTS } });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const settings = await readPlatformNumberSettings(adminClient);
    return NextResponse.json({ success: true, source: "supabase", data: settings });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: parsed.data });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const now = new Date().toISOString();
    const rows = Object.entries(parsed.data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value: value as number, updated_at: now }));

    if (rows.length > 0) {
      const { error } = await adminClient.from("platform_settings").upsert(rows, { onConflict: "key" });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, source: "supabase", data: parsed.data });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
