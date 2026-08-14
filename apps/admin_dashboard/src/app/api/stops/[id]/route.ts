import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

const stopUpdateSchema = z.object({
  route_id: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  sequence_no: z.number().int().min(1).optional(),
  geofence_radius_meters: z.number().min(5).optional(),
  stop_type: z.enum(["PICKUP", "DROPOFF", "BOTH"]).optional(),
  distance_from_prev_meters: z.number().optional(),
  duration_from_prev_seconds: z.number().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = stopUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const updatePayload: Record<string, unknown> = {};
    if (result.data.route_id !== undefined) updatePayload.route_id = result.data.route_id;
    if (result.data.name !== undefined) updatePayload.name = result.data.name;
    if (result.data.sequence_no !== undefined) updatePayload.sequence_no = result.data.sequence_no;
    if (result.data.geofence_radius_meters !== undefined) updatePayload.geofence_radius_meters = result.data.geofence_radius_meters;
    if (result.data.stop_type !== undefined) updatePayload.stop_type = result.data.stop_type;
    if (result.data.distance_from_prev_meters !== undefined) updatePayload.distance_from_prev_meters = result.data.distance_from_prev_meters;
    if (result.data.duration_from_prev_seconds !== undefined) updatePayload.duration_from_prev_seconds = result.data.duration_from_prev_seconds;

    if (result.data.longitude !== undefined && result.data.latitude !== undefined) {
      updatePayload.location = `POINT(${result.data.longitude} ${result.data.latitude})`;
    }

    if (result.data.route_id) {
      const { data: ownedRoute } = await scope.client
        .from("routes")
        .select("id")
        .eq("id", result.data.route_id)
        .eq("tenant_id", scope.tenantId)
        .maybeSingle();
      if (!ownedRoute) {
        return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
      }
    }

    const { data: stopUpdate, error } = await scope.client
      .from("stops")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .select()
      .maybeSingle();

    if (error) {
      console.error(`Supabase stop update error for ${id}:`, error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!stopUpdate) {
      return NextResponse.json({ success: false, error: "Stop not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: stopUpdate });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock" });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: deleted, error } = await scope.client
      .from("stops")
      .delete()
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(`Supabase stop delete error for ${id}:`, error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Stop not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase" });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
