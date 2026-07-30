import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { resolveRequestDb } from "@/lib/driverSession";
import { z } from "zod";

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
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

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

    const client = getSupabaseClient(token);
    
    // Fetch latest coordinates. PostgREST handles PostGIS Point as GeoJSON Point object automatically.
    const { data: telemetry, error } = await client
      .from("live_coordinates")
      .select("id, vehicle_id, route_id, coordinates, speed, bearing, created_at")
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

    const db = await resolveRequestDb(request);
    if (!db) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const resolvedTenantId = tenant_id || db.driver?.tenant_id;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "tenant_id is required" }, { status: 400 });
    }

    if (db.mode === "driver" && db.driver) {
      if (db.driver.tenant_id !== resolvedTenantId) {
        return NextResponse.json({ success: false, error: "Tenant mismatch" }, { status: 403 });
      }
      if (db.driver.vehicle_id && db.driver.vehicle_id !== vehicle_id) {
        return NextResponse.json({ success: false, error: "Vehicle not assigned to driver" }, { status: 403 });
      }
    }

    const { data: telemetryInsert, error } = await db.client
      .from("live_coordinates")
      .insert({
        tenant_id: resolvedTenantId,
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
