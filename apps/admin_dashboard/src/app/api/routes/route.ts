import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

interface RouteData {
  id: string;
  name: string;
  path: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
}

const mockRoutes: RouteData[] = [
  {
    id: "route-1",
    name: "Morning Route 1 (Kileleshwa)",
    path: {
      type: "LineString",
      coordinates: [
        [36.7889, -1.2789],
        [36.7925, -1.2754],
        [36.7981, -1.2721],
        [36.8045, -1.2685],
        [36.8122, -1.2652],
      ],
    },
  },
  {
    id: "route-2",
    name: "Morning Route 2 (Westlands)",
    path: {
      type: "LineString",
      coordinates: [
        [36.8021, -1.2612],
        [36.8085, -1.2645],
        [36.8115, -1.2699],
        [36.8145, -1.2731],
        [36.8219, -1.2921], // St. Mary's Academy
      ],
    },
  },
  {
    id: "route-4",
    name: "Morning Route 4 (Kilimani)",
    path: {
      type: "LineString",
      coordinates: [
        [36.7825, -1.2952],
        [36.7915, -1.2941],
        [36.7995, -1.2915],
        [36.8095, -1.2905],
        [36.8219, -1.2921], // St. Mary's Academy
      ],
    },
  },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: mockRoutes,
      });
    }

    const client = getSupabaseClient(token);
    
    // Fetch routes from Supabase. PostGIS geometry column "path" is automatically
    // returned as a GeoJSON LineString object by PostgREST.
    const { data: routes, error } = await client
      .from("routes")
      .select("id, name, path");

    if (error) {
      console.warn("Supabase routes fetch error, falling back to mock:", error.message);
      return NextResponse.json({
        success: true,
        source: "supabase_error_fallback",
        data: mockRoutes,
      });
    }

    const routesList = routes && routes.length > 0 ? routes : mockRoutes;

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: routesList as RouteData[],
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
