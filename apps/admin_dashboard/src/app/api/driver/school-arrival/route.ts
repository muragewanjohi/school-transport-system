import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";
import {
  decideSchoolArrival,
  durationSecondsFromRange,
  lastSequencedStopId,
  mockSchoolArrivalTrip,
  SCHOOL_ARRIVAL_ERRORS,
  type SequencedStop,
} from "@/lib/schoolArrival";

const schoolArrivalSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
  stop_id: z.string().uuid("Invalid stop ID"),
});

type TripRow = {
  id: string;
  tenant_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  schedule_id: string | null;
  route_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  campus_id: string | null;
};

function arrivalResponse(input: {
  tripId: string;
  stopId: string;
  durationSeconds: number;
  droppedOffCount: number;
  idempotent?: boolean;
}) {
  return {
    trip_id: input.tripId,
    stop_id: input.stopId,
    status: "completed" as const,
    duration_seconds: input.durationSeconds,
    dropped_off_count: input.droppedOffCount,
  };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = schoolArrivalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    if (!isSupabaseConfigured) {
      const mockTrip = mockSchoolArrivalTrip(payload.trip_id);
      if (!mockTrip) {
        return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
      }
      const decision = decideSchoolArrival({
        status: mockTrip.status,
        direction: mockTrip.direction,
        stopId: payload.stop_id,
        lastStopId: mockTrip.lastStopId,
        startedAt: mockTrip.startedAt,
        completedAt: mockTrip.completedAt,
        durationSeconds: mockTrip.durationSeconds,
      });
      if (decision.kind === "reject") {
        return NextResponse.json(
          { success: false, error: SCHOOL_ARRIVAL_ERRORS[decision.reason] },
          { status: 409 }
        );
      }
      const completedAt = mockTrip.completedAt ?? new Date().toISOString();
      const duration =
        decision.kind === "idempotent"
          ? decision.durationSeconds
          : durationSecondsFromRange(mockTrip.startedAt, completedAt);
      return NextResponse.json({
        success: true,
        source: "mock",
        idempotent: decision.kind === "idempotent",
        data: arrivalResponse({
          tripId: payload.trip_id,
          stopId: payload.stop_id,
          durationSeconds: duration,
          droppedOffCount: decision.kind === "idempotent" ? 0 : 2,
        }),
      });
    }

    const token = extractBearerToken(request);
    const driver = token ? verifyDriverSession(token) : null;

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    const { data: trip, error: tripError } = await client
      .from("trips")
      .select(
        "id, tenant_id, status, started_at, completed_at, duration_seconds, schedule_id, route_id, vehicle_id, driver_id, campus_id"
      )
      .eq("id", payload.trip_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (tripError || !trip) {
      return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    }

    const tripRow = trip as TripRow;
    if (driver?.vehicle_id && tripRow.vehicle_id && driver.vehicle_id !== tripRow.vehicle_id) {
      return NextResponse.json(
        { success: false, error: "Trip does not belong to this vehicle" },
        { status: 403 }
      );
    }

    let direction = "HOME_TO_SCHOOL";
    if (tripRow.schedule_id) {
      const { data: schedule } = await client
        .from("schedules")
        .select("direction")
        .eq("id", tripRow.schedule_id)
        .maybeSingle();
      if (schedule && typeof (schedule as { direction?: string }).direction === "string") {
        direction = (schedule as { direction: string }).direction;
      }
    }

    const routeId = tripRow.route_id;
    let lastStopId: string | null = null;
    if (routeId) {
      const { data: stops } = await client
        .from("stops")
        .select("id, sequence_no")
        .eq("route_id", routeId)
        .eq("tenant_id", scope.tenantId)
        .order("sequence_no", { ascending: true });
      lastStopId = lastSequencedStopId((stops ?? []) as SequencedStop[]);
    }

    const decision = decideSchoolArrival({
      status: tripRow.status,
      direction,
      stopId: payload.stop_id,
      lastStopId,
      startedAt: tripRow.started_at,
      completedAt: tripRow.completed_at,
      durationSeconds: tripRow.duration_seconds,
    });

    if (decision.kind === "reject") {
      return NextResponse.json(
        { success: false, error: SCHOOL_ARRIVAL_ERRORS[decision.reason] },
        { status: 409 }
      );
    }

    if (decision.kind === "idempotent") {
      return NextResponse.json({
        success: true,
        source: "supabase",
        idempotent: true,
        data: arrivalResponse({
          tripId: payload.trip_id,
          stopId: payload.stop_id,
          durationSeconds: decision.durationSeconds,
          droppedOffCount: 0,
        }),
      });
    }

    const completedAt = new Date();
    const completedIso = completedAt.toISOString();
    const duration = durationSecondsFromRange(tripRow.started_at, completedAt);

    const { data: droppedRows, error: dropError } = await client
      .from("trip_manifests")
      .update({ attendance: "dropped_off", dropped_off_at: completedIso })
      .eq("trip_id", payload.trip_id)
      .eq("tenant_id", scope.tenantId)
      .eq("attendance", "boarded")
      .select("id");

    if (dropError) {
      return NextResponse.json({ success: false, error: dropError.message }, { status: 400 });
    }

    const { error: absentError } = await client
      .from("trip_manifests")
      .update({ attendance: "absent" })
      .eq("trip_id", payload.trip_id)
      .eq("tenant_id", scope.tenantId)
      .eq("attendance", "pending");

    if (absentError) {
      return NextResponse.json({ success: false, error: absentError.message }, { status: 400 });
    }

    const droppedOffCount = (droppedRows ?? []).length;

    const visitPayload = {
      tenant_id: scope.tenantId,
      trip_id: payload.trip_id,
      stop_id: payload.stop_id,
      route_id: routeId,
      campus_id: tripRow.campus_id,
      vehicle_id: tripRow.vehicle_id ?? driver?.vehicle_id ?? null,
      driver_id: tripRow.driver_id ?? driver?.sub ?? null,
      outcome: "completed",
      arrived_at: completedIso,
      departed_at: completedIso,
      dwell_seconds: 0,
      students_actioned: droppedOffCount,
      alerted: false,
      updated_at: completedIso,
    };

    const { error: visitError } = await client
      .from("trip_stop_visits")
      .upsert(visitPayload, { onConflict: "trip_id,stop_id" });

    if (visitError) {
      return NextResponse.json({ success: false, error: visitError.message }, { status: 400 });
    }

    const { error: tripUpdateError } = await client
      .from("trips")
      .update({
        status: "completed",
        completed_at: completedIso,
        duration_seconds: duration,
      })
      .eq("id", payload.trip_id)
      .eq("tenant_id", scope.tenantId);

    if (tripUpdateError) {
      return NextResponse.json({ success: false, error: tripUpdateError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: arrivalResponse({
        tripId: payload.trip_id,
        stopId: payload.stop_id,
        durationSeconds: duration,
        droppedOffCount,
      }),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
