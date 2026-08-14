import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

// Zod schema for telemetry ingestion validation
const telemetryIngestSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID").optional(),
  vehicle_id: z.string().uuid("Invalid vehicle ID format"),
  route_id: z.string().uuid("Invalid route ID format"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional(),
  bearing: z.number().min(0).max(360).optional(),
  is_emergency: z.boolean().optional(),
});
interface TelemetryPoint {
  id: string;
  vehicle_id: string;
  route_id: string;
  coordinates: {
    type: "Point";
    coordinates: [number, number];
  } | null;
  speed: number | null;
  bearing: number | null;
  created_at: string;
}

// GET: Retrieve latest coordinate telemetry
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      // Mocked telemetry data matching Nairobi routes
      const mockTelemetry: TelemetryPoint[] = [
        {
          id: "tele-1",
          vehicle_id: "e5015e10-c09a-4c22-901d-5573752e379c",
          route_id: "route-1",
          coordinates: {
            type: "Point",
            coordinates: [36.7981, -1.2721],
          },
          speed: 42.5,
          bearing: 135,
          created_at: new Date().toISOString(),
        },
        {
          id: "tele-2",
          vehicle_id: "8c9ad841-f762-4217-a021-9876251b5bcf",
          route_id: "route-2",
          coordinates: {
            type: "Point",
            coordinates: [36.8115, -1.2699],
          },
          speed: 38.0,
          bearing: 220,
          created_at: new Date().toISOString(),
        },
      ];

      return NextResponse.json({
        success: true,
        source: "mock",
        data: mockTelemetry,
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: telemetry, error } = await scope.client
      .from("live_coordinates")
      .select("id, vehicle_id, route_id, coordinates, speed, bearing, created_at")
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: telemetry as TelemetryPoint[],
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// POST: Ingest new coordinates from drivers or simulators
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    
    // Validate request payload using Zod
    const validationResult = telemetryIngestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { tenant_id, vehicle_id, route_id, latitude, longitude, speed, bearing, is_emergency } =
      validationResult.data;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          message: "Telemetry coordinate accepted (Mock Mode)",
          timestamp: new Date().toISOString(),
          details: { tenant_id, vehicle_id, route_id, latitude, longitude, speed, bearing, is_emergency }
        }
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    if (tenant_id && tenant_id !== scope.tenantId) {
      return NextResponse.json({ success: false, error: "Tenant mismatch" }, { status: 403 });
    }

    const { data: ownedVehicle } = await scope.client
      .from("vehicles")
      .select("id")
      .eq("id", vehicle_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!ownedVehicle) {
      return NextResponse.json({ success: false, error: "Vehicle not found" }, { status: 404 });
    }

    const { data: ownedRoute } = await scope.client
      .from("routes")
      .select("id")
      .eq("id", route_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!ownedRoute) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
    }

    const { data: telemetryInsert, error } = await scope.client
      .from("live_coordinates")
      .insert({
        tenant_id: scope.tenantId,
        vehicle_id,
        route_id,
        coordinates: `POINT(${longitude} ${latitude})`,
        speed: speed ?? null,
        bearing: bearing ?? null,
        is_emergency: is_emergency ?? false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: telemetryInsert,
    });  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
