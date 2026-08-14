import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

type NestedName = { name?: string } | { name?: string }[] | null;
type NestedPlate = { license_plate?: string } | { license_plate?: string }[] | null;

function nestedName(value: NestedName): string {
  if (!value) return "";
  if (Array.isArray(value)) return value[0]?.name ?? "";
  return value.name ?? "";
}

function nestedPlate(value: NestedPlate): string {
  if (!value) return "";
  if (Array.isArray(value)) return value[0]?.license_plate ?? "";
  return value.license_plate ?? "";
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: [] });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data, error } = await scope.client
      .from("trip_stop_visits")
      .select(
        "id, outcome, dwell_seconds, alerted, created_at, arrived_at, departed_at, stop:stops(name), route:routes(name), vehicle:vehicles(license_plate)"
      )
      .eq("tenant_id", scope.tenantId)
      .eq("alerted", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    const rows = (data ?? []).map((row) => {
      const record = row as {
        id: string;
        outcome: string;
        dwell_seconds: number;
        alerted: boolean;
        created_at: string;
        arrived_at: string | null;
        departed_at: string | null;
        stop: NestedName;
        route: NestedName;
        vehicle: NestedPlate;
      };
      return {
        id: record.id,
        outcome: record.outcome,
        dwell_seconds: record.dwell_seconds,
        created_at: record.created_at,
        arrived_at: record.arrived_at,
        departed_at: record.departed_at,
        stop_name: nestedName(record.stop) || "Stop",
        route_name: nestedName(record.route) || "Route",
        vehicle_plate: nestedPlate(record.vehicle) || "Bus",
      };
    });

    return NextResponse.json({ success: true, source: "supabase", data: rows });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
