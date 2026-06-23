import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const stopCreateSchema = z.object({
  route_id: z.string().min(1, "Invalid Route selection"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  longitude: z.number(),
  latitude: z.number(),
  sequence_no: z.number().int().min(1),
  geofence_radius_meters: z.number().min(5).default(50),
  stop_type: z.enum(["PICKUP", "DROPOFF", "BOTH"]).default("BOTH"),
  distance_from_prev_meters: z.number().optional().default(0),
  duration_from_prev_seconds: z.number().optional().default(0),
});

export const mockStops = [
  {
    id: "stop-1-1",
    route_id: "route-1",
    name: "Kileleshwa stop (Githunguri Road)",
    location: { type: "Point", coordinates: [36.7889, -1.2789] },
    sequence_no: 1,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  },
  {
    id: "stop-1-2",
    route_id: "route-1",
    name: "Kileleshwa North Stop",
    location: { type: "Point", coordinates: [36.7925, -1.2754] },
    sequence_no: 2,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  },
  {
    id: "stop-2-1",
    route_id: "route-2",
    name: "Westlands stop (Mwanzi Road)",
    location: { type: "Point", coordinates: [36.8085, -1.2645] },
    sequence_no: 1,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  },
  {
    id: "stop-2-2",
    route_id: "route-2",
    name: "Lavington stop (James Gichuru)",
    location: { type: "Point", coordinates: [36.7725, -1.2852] },
    sequence_no: 2,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  },
  {
    id: "stop-4-1",
    route_id: "route-4",
    name: "Kilimani stop (Chania Avenue)",
    location: { type: "Point", coordinates: [36.7915, -1.2941] },
    sequence_no: 1,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  },
  {
    id: "stop-4-2",
    route_id: "route-4",
    name: "Karen stop (Hardy Shopping Center)",
    location: { type: "Point", coordinates: [36.7495, -1.3392] },
    sequence_no: 2,
    geofence_radius_meters: 50,
    stop_type: "BOTH"
  }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get("route_id");
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      let filtered = mockStops;
      if (routeId) {
        filtered = mockStops.filter(s => s.route_id === routeId);
      }
      return NextResponse.json({ success: true, source: "mock", data: filtered });
    }

    const client = getSupabaseClient(token);
    
    let query = client.from("stops").select("id, tenant_id, route_id, name, location, sequence_no, geofence_radius_meters, stop_type, distance_from_prev_meters, duration_from_prev_seconds, created_at, updated_at");
    
    if (routeId) {
      query = query.eq("route_id", routeId);
    }

    const { data: stops, error } = await query.order("sequence_no", { ascending: true });

    if (error) {
      console.warn("Supabase stops fetch error, falling back to mock:", error.message);
      let filtered = mockStops;
      if (routeId) {
        filtered = mockStops.filter(s => s.route_id === routeId);
      }
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: filtered });
    }

    const mappedStops = (stops || []).map(stop => {
      let locGeo: any = null;
      if (stop.location) {
        if (typeof stop.location === "string") {
          const match = stop.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
          if (match) {
            locGeo = { type: "Point", coordinates: [parseFloat(match[1]), parseFloat(match[2])] };
          }
        } else {
          locGeo = stop.location;
        }
      }
      return {
        ...stop,
        location: locGeo
      };
    });

    return NextResponse.json({ success: true, source: "supabase", data: mappedStops });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = stopCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    const locGeoJSON = {
      type: "Point" as const,
      coordinates: [result.data.longitude, result.data.latitude] as [number, number]
    };

    if (!isSupabaseConfigured) {
      const newMockStop = {
        id: `stop-${Math.floor(Math.random() * 1000)}`,
        route_id: result.data.route_id,
        name: result.data.name,
        location: locGeoJSON,
        sequence_no: result.data.sequence_no,
        geofence_radius_meters: result.data.geofence_radius_meters,
        stop_type: result.data.stop_type,
        distance_from_prev_meters: result.data.distance_from_prev_meters,
        duration_from_prev_seconds: result.data.duration_from_prev_seconds,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockStop });
    }

    const client = getSupabaseClient(token);

    // Fetch tenant ID
    let tenantId = "8c9ad841-f762-4217-a021-9876251b5bcf";
    const { data: tenants } = await client.from("tenants").select("id").limit(1);
    if (tenants && tenants.length > 0) {
      tenantId = tenants[0].id;
    }

    const locationWKT = `POINT(${result.data.longitude} ${result.data.latitude})`;

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      route_id: result.data.route_id,
      name: result.data.name,
      location: locationWKT,
      sequence_no: result.data.sequence_no,
      geofence_radius_meters: result.data.geofence_radius_meters,
      stop_type: result.data.stop_type,
      distance_from_prev_meters: result.data.distance_from_prev_meters,
      duration_from_prev_seconds: result.data.duration_from_prev_seconds,
    };

    const { data: stopInsert, error } = await client
      .from("stops")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase stop insert error, falling back to mock save:", error.message);
      const mockStop = {
        ...payload,
        location: locGeoJSON,
        id: `stop-db-fallback-${Math.floor(Math.random() * 1000)}`
      };
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockStop });
    }

    return NextResponse.json({ success: true, source: "supabase", data: stopInsert });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
