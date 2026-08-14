import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  demoReadonlyForbiddenResponse,
  getCallerProfile,
  isDemoReadonly,
} from "@/lib/authApi";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import {
  orderedIdsAfterAttach,
  parseStopCoordinates,
} from "@/lib/attachStopsToRoute";

const attachSchema = z.object({
  route_id: z.string().min(1),
  stop_ids: z.array(z.string().min(1)).min(1),
});

type StopType = "PICKUP" | "DROPOFF" | "BOTH";

interface SourceStopRow {
  id: string;
  tenant_id: string;
  campus_id: string | null;
  route_id: string;
  name: string;
  location: unknown;
  geofence_radius_meters: number;
  stop_type: StopType;
}

export async function POST(request: Request) {
  try {
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const body: unknown = await request.json();
    const parsed = attachSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { route_id: routeId, stop_ids: stopIds } = parsed.data;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { attached: stopIds.length, route_id: routeId },
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    const uniqueIds = [...new Set(stopIds)];
    const { data: sourceStops, error: sourceError } = await client
      .from("stops")
      .select("id, tenant_id, campus_id, route_id, name, location, geofence_radius_meters, stop_type")
      .in("id", uniqueIds)
      .eq("tenant_id", scope.tenantId);

    if (sourceError) {
      return NextResponse.json({ success: false, error: sourceError.message }, { status: 500 });
    }

    const { data: existingStops, error: existingError } = await client
      .from("stops")
      .select("id")
      .eq("route_id", routeId)
      .eq("tenant_id", scope.tenantId)
      .order("sequence_no", { ascending: true });

    if (existingError) {
      return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
    }

    const existingIds = ((existingStops ?? []) as Array<{ id: string }>).map((row) => row.id);
    const toClone = ((sourceStops ?? []) as SourceStopRow[]).filter(
      (stop) => stop.route_id !== routeId,
    );

    if (toClone.length === 0) {
      return NextResponse.json({ success: false, error: "Select stops from another route." }, { status: 400 });
    }

    const inserts = toClone.flatMap((stop) => {
      const point = parseStopCoordinates(stop.location);
      if (!point) return [];
      return [{
        id: crypto.randomUUID(),
        tenant_id: scope.tenantId,
        campus_id: stop.campus_id,
        route_id: routeId,
        name: stop.name,
        location: `POINT(${point.longitude} ${point.latitude})`,
        sequence_no: existingIds.length + 1000 + insertsOffset(toClone, stop.id),
        geofence_radius_meters: stop.geofence_radius_meters || 50,
        stop_type: stop.stop_type || "BOTH",
        distance_from_prev_meters: 0,
        duration_from_prev_seconds: 0,
      }];
    });

    if (inserts.length === 0) {
      return NextResponse.json({ success: false, error: "Selected stops are missing coordinates." }, { status: 400 });
    }

    const { error: insertError } = await client.from("stops").insert(inserts);
    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    const attachedIds = inserts.map((row) => row.id);
    const orderedIds = orderedIdsAfterAttach(existingIds, attachedIds);

    const { error: rpcError } = await client.rpc("reorder_stops", { stop_ids: orderedIds });
    if (rpcError) {
      for (let i = 0; i < orderedIds.length; i += 1) {
        await client.from("stops").update({ sequence_no: -(i + 1) }).eq("id", orderedIds[i]);
      }
      for (let i = 0; i < orderedIds.length; i += 1) {
        const { error: seqError } = await client
          .from("stops")
          .update({ sequence_no: i + 1 })
          .eq("id", orderedIds[i]);
        if (seqError) {
          return NextResponse.json({ success: false, error: seqError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: { attached: attachedIds.length, route_id: routeId, stop_ids: attachedIds },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

function insertsOffset(stops: SourceStopRow[], stopId: string): number {
  return stops.findIndex((stop) => stop.id === stopId);
}
