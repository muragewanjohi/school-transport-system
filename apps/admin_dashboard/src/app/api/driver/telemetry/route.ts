import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { resolveRequestDb } from "@/lib/driverSession";

const telemetryIngestSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID"),
  vehicle_id: z.string().uuid("Invalid vehicle ID"),
  route_id: z.string().uuid("Invalid route ID"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional(),
  bearing: z.number().min(0).max(360).optional(),
  is_emergency: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = telemetryIngestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { message: "Telemetry accepted (mock)", ...payload, timestamp: new Date().toISOString() },
      });
    }

    const db = await resolveRequestDb(request);
    if (!db) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (db.mode === "driver") {
      if (db.driver?.tenant_id !== payload.tenant_id) {
        return NextResponse.json({ success: false, error: "Tenant mismatch" }, { status: 403 });
      }
      if (db.driver.vehicle_id && db.driver.vehicle_id !== payload.vehicle_id) {
        return NextResponse.json({ success: false, error: "Vehicle not assigned to driver" }, { status: 403 });
      }
    }

    const { error } = await db.client.from("live_coordinates").insert({
      tenant_id: payload.tenant_id,
      vehicle_id: payload.vehicle_id,
      route_id: payload.route_id,
      coordinates: `POINT(${payload.longitude} ${payload.latitude})`,
      speed: payload.speed ?? null,
      bearing: payload.bearing ?? null,
      is_emergency: payload.is_emergency ?? false,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: { message: "Telemetry coordinate accepted", timestamp: new Date().toISOString() },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
