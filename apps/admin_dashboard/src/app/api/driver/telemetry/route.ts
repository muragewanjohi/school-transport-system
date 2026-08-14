import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

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

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    if (payload.tenant_id !== scope.tenantId) {
      return NextResponse.json({ success: false, error: "Tenant mismatch" }, { status: 403 });
    }

    const { data: ownedVehicle } = await scope.client
      .from("vehicles")
      .select("id")
      .eq("id", payload.vehicle_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!ownedVehicle) {
      return NextResponse.json({ success: false, error: "Vehicle not found" }, { status: 404 });
    }

    const { data: ownedRoute } = await scope.client
      .from("routes")
      .select("id")
      .eq("id", payload.route_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!ownedRoute) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
    }

    const { error } = await scope.client.from("live_coordinates").insert({
      tenant_id: scope.tenantId,
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
