import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import type { SchoolOption } from "@/lib/routeEndpointSelection";

const mockCampuses: SchoolOption[] = [
  {
    id: "campus-mock-1",
    name: "St. Mary's Academy (Upper School)",
    latitude: -1.2921,
    longitude: 36.8219,
  },
];

interface CampusRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  location: { type?: string; coordinates?: unknown } | string | null;
}

function campusCoordinates(row: CampusRow): { latitude: number; longitude: number } | null {
  if (typeof row.latitude === "number" && typeof row.longitude === "number") {
    return { latitude: row.latitude, longitude: row.longitude };
  }
  const loc = row.location;
  if (loc && typeof loc === "object" && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const lng = loc.coordinates[0];
    const lat = loc.coordinates[1];
    if (typeof lat === "number" && typeof lng === "number") {
      return { latitude: lat, longitude: lng };
    }
  }
  if (typeof loc === "string") {
    const match = loc.match(/POINT\(([^ ]+) ([^ ]+)\)/i);
    if (match) {
      return { longitude: Number(match[1]), latitude: Number(match[2]) };
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockCampuses });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: campuses, error } = await scope.client
      .from("campuses")
      .select("id, name, latitude, longitude, location")
      .eq("tenant_id", scope.tenantId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Supabase campuses fetch error, falling back to mock:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockCampuses });
    }

    const data: SchoolOption[] = (campuses as CampusRow[] | null ?? []).flatMap((row) => {
      const coords = campusCoordinates(row);
      if (!coords) return [];
      return [{ id: row.id, name: row.name, latitude: coords.latitude, longitude: coords.longitude }];
    });

    return NextResponse.json({ success: true, source: "supabase", data });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
