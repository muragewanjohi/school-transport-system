import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";
import {
  adminStopAlertMessage,
  dwellSeconds,
  shouldOverwriteOutcome,
  STOP_VISIT_OUTCOMES,
  type StopVisitOutcome,
} from "@/lib/stopVisitOutcome";

const stopVisitSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
  stop_id: z.string().uuid("Invalid stop ID"),
  route_id: z.string().uuid("Invalid route ID").optional().nullable(),
  outcome: z.enum(STOP_VISIT_OUTCOMES),
  arrived_at: z.string().optional().nullable(),
  departed_at: z.string().optional().nullable(),
  dwell_seconds: z.number().int().min(0).optional(),
  students_actioned: z.number().int().min(0).optional().default(0),
  alerted: z.boolean().optional(),
});

type TripRow = {
  id: string;
  tenant_id: string;
  route_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  campus_id: string | null;
};

type StopRow = {
  id: string;
  name: string;
  route_id: string;
};

type VisitRow = {
  id: string;
  outcome: StopVisitOutcome;
  alerted: boolean;
};

async function notifySchoolAdmins(
  client: SupabaseClient,
  tenantId: string,
  message: string
): Promise<void> {
  const { data: admins } = await client
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "school_admin");

  const rows = (admins ?? []).map((admin: { id: string }) => ({
    tenant_id: tenantId,
    user_id: admin.id,
    title: "Stop visit alert",
    message,
    notification_type: "stop_visit",
    read: false,
  }));

  if (rows.length === 0) return;
  await client.from("notifications").insert(rows);
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = stopVisitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const token = extractBearerToken(request);
    const driver = token ? verifyDriverSession(token) : null;

    if (!isSupabaseConfigured) {
      const departedAt = payload.departed_at ?? new Date().toISOString();
      const dwell = payload.dwell_seconds ?? dwellSeconds(payload.arrived_at ?? null, departedAt);
      const alerted = payload.alerted ?? (payload.outcome === "visited" || payload.outcome === "skipped");
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          ...payload,
          dwell_seconds: dwell,
          alerted,
          students_actioned: payload.students_actioned ?? 0,
        },
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    const { data: trip, error: tripError } = await client
      .from("trips")
      .select("id, tenant_id, route_id, vehicle_id, driver_id, campus_id")
      .eq("id", payload.trip_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (tripError || !trip) {
      return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    }

    const tripRow = trip as TripRow;
    if (driver?.vehicle_id && tripRow.vehicle_id && driver.vehicle_id !== tripRow.vehicle_id) {
      return NextResponse.json({ success: false, error: "Trip does not belong to this vehicle" }, { status: 403 });
    }

    const { data: stop, error: stopError } = await client
      .from("stops")
      .select("id, name, route_id")
      .eq("id", payload.stop_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (stopError || !stop) {
      return NextResponse.json({ success: false, error: "Stop not found" }, { status: 404 });
    }

    const stopRow = stop as StopRow;
    const routeId = payload.route_id ?? tripRow.route_id ?? stopRow.route_id;
    if (stopRow.route_id !== routeId) {
      return NextResponse.json({ success: false, error: "Stop is not on this trip route" }, { status: 400 });
    }

    const departedAt = payload.departed_at ?? new Date().toISOString();
    const dwell = payload.dwell_seconds ?? dwellSeconds(payload.arrived_at ?? null, departedAt);
    const alerted = payload.alerted ?? (payload.outcome === "visited" || payload.outcome === "skipped");

    const { data: existing } = await client
      .from("trip_stop_visits")
      .select("id, outcome, alerted")
      .eq("trip_id", payload.trip_id)
      .eq("stop_id", payload.stop_id)
      .maybeSingle();

    const existingRow = existing as VisitRow | null;
    if (existingRow && !shouldOverwriteOutcome(existingRow.outcome, payload.outcome)) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        data: existingRow,
        unchanged: true,
      });
    }

    const visitPayload = {
      tenant_id: scope.tenantId,
      trip_id: payload.trip_id,
      stop_id: payload.stop_id,
      route_id: routeId,
      campus_id: tripRow.campus_id,
      vehicle_id: tripRow.vehicle_id ?? driver?.vehicle_id ?? null,
      driver_id: tripRow.driver_id ?? driver?.sub ?? null,
      outcome: payload.outcome,
      arrived_at: payload.arrived_at ?? null,
      departed_at: departedAt,
      dwell_seconds: dwell,
      students_actioned: payload.students_actioned ?? 0,
      alerted,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await client
      .from("trip_stop_visits")
      .upsert(visitPayload, { onConflict: "trip_id,stop_id" })
      .select("id, outcome, dwell_seconds, alerted, arrived_at, departed_at")
      .maybeSingle();

    if (saveError) {
      return NextResponse.json({ success: false, error: saveError.message }, { status: 400 });
    }

    if (alerted && (!existingRow || !existingRow.alerted)) {
      const { data: route } = await client
        .from("routes")
        .select("name")
        .eq("id", routeId)
        .maybeSingle();
      const { data: vehicle } = tripRow.vehicle_id
        ? await client.from("vehicles").select("license_plate").eq("id", tripRow.vehicle_id).maybeSingle()
        : { data: null };

      const message = adminStopAlertMessage({
        outcome: payload.outcome,
        stopName: stopRow.name,
        routeName: (route as { name?: string } | null)?.name || "Route",
        vehiclePlate: (vehicle as { license_plate?: string } | null)?.license_plate ?? null,
      });

      if (message) {
        try {
          await notifySchoolAdmins(client, scope.tenantId, message);
        } catch {
          // Visit is already persisted; do not fail the driver request on notify.
        }
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: saved,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
