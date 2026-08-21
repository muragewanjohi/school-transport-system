import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";
import { studentLinkedToParent } from "@/lib/parentChildren";
import {
  childStopIdForDirection,
  estimateParentTripDurationMinutes,
  etaMinutesFromPredictedArrival,
  isInProgressTrip,
  nairobiTripDate,
  nairobiWeekday,
  nestedBusNumber,
  nestedDirection,
  nestedName,
  nestedPlate,
  parentChildStatusFromSources,
  parentCrewContactFromProfile,
  parseLiveCoordinates,
  pickEarliestNextTrip,
  scheduleRunsOnWeekday,
  type ParentNextTripCandidate,
  type ParentNextTripPayload,
} from "@/lib/parentLive";

const querySchema = z.object({
  student_id: z.string().uuid("student_id must be a UUID"),
});

type StudentRow = {
  id: string;
  parent_id: string | null;
  tenant_id: string;
  route_id: string | null;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  transit_status: string | null;
  guardians?: unknown;
};

async function resolveNextTrip(input: {
  db: NonNullable<ReturnType<typeof getServiceSupabaseClient>>;
  tenantId: string;
  routeId: string;
  now?: Date;
}): Promise<ParentNextTripPayload | null> {
  const { db, tenantId, routeId } = input;
  const now = input.now ?? new Date();
  const tripDate = nairobiTripDate(now);
  const weekday = nairobiWeekday(now);
  const candidates: ParentNextTripCandidate[] = [];

  const { data: scheduledTrips } = await db
    .from("trips")
    .select(
      "id, custom_departure_time, vehicle_id, schedule:schedules(name, departure_time, direction), vehicle:vehicles(license_plate, bus_number)"
    )
    .eq("route_id", routeId)
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .eq("trip_date", tripDate)
    .limit(20);

  for (const trip of scheduledTrips ?? []) {
    const row = trip as Record<string, unknown>;
    const scheduleRaw = row.schedule;
    const schedule = Array.isArray(scheduleRaw) ? scheduleRaw[0] : scheduleRaw;
    const scheduleRec =
      schedule && typeof schedule === "object"
        ? (schedule as Record<string, unknown>)
        : null;
    candidates.push({
      custom_departure_time:
        typeof row.custom_departure_time === "string" ? row.custom_departure_time : null,
      departure_time:
        typeof scheduleRec?.departure_time === "string" ? scheduleRec.departure_time : null,
      direction: nestedDirection(schedule),
      schedule_name: nestedName(schedule),
      vehicle_plate: nestedPlate(row.vehicle),
      bus_number: nestedBusNumber(row.vehicle),
    });
  }

  if (candidates.length === 0) {
    const { data: schedules } = await db
      .from("schedules")
      .select("id, name, departure_time, direction, days_of_week")
      .eq("route_id", routeId)
      .eq("tenant_id", tenantId)
      .limit(20);

    const { data: routeRow } = await db
      .from("routes")
      .select("vehicle_id, vehicle:vehicles(license_plate, bus_number)")
      .eq("id", routeId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const routeVehicle = (routeRow as Record<string, unknown> | null)?.vehicle;

    for (const sch of schedules ?? []) {
      const s = sch as Record<string, unknown>;
      if (!scheduleRunsOnWeekday(s.days_of_week, weekday)) continue;
      candidates.push({
        departure_time: typeof s.departure_time === "string" ? s.departure_time : null,
        direction: typeof s.direction === "string" ? s.direction : null,
        schedule_name: typeof s.name === "string" ? s.name : null,
        vehicle_plate: nestedPlate(routeVehicle),
        bus_number: nestedBusNumber(routeVehicle),
      });
    }
  }

  const picked = pickEarliestNextTrip(candidates);
  if (!picked) return null;

  if (picked.estimated_duration_minutes == null) {
    const [{ count: stopCount }, { count: studentCount }] = await Promise.all([
      db
        .from("stops")
        .select("id", { count: "exact", head: true })
        .eq("route_id", routeId)
        .eq("tenant_id", tenantId),
      db
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("route_id", routeId)
        .eq("tenant_id", tenantId),
    ]);
    picked.estimated_duration_minutes = estimateParentTripDurationMinutes({
      stopCount: stopCount ?? 0,
      studentCount: studentCount ?? 0,
    });
  }

  return picked;
}

export async function GET(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      student_id: url.searchParams.get("student_id"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { student_id } = parsed.data;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        trip_active: false,
        trip: null,
        live: null,
        next_stop: null,
        eta: null,
        next_trip: null,
        transit_status: "Waiting for pickup",
      });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { data: student, error: studentError } = await db
      .from("students")
      .select(
        "id, parent_id, tenant_id, route_id, pickup_stop_id, dropoff_stop_id, transit_status, guardians"
      )
      .eq("id", student_id)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();

    if (studentError) {
      return NextResponse.json({ success: false, error: "Failed to load student" }, { status: 500 });
    }

    const row = student as StudentRow | null;
    if (!row) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("phone")
      .eq("id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();
    const parentPhone = typeof profile?.phone === "string" ? profile.phone : "";

    const allowed = studentLinkedToParent({
      parentId: parent.sub,
      parentPhone,
      student: row,
    });
    if (!allowed || row.tenant_id !== parent.tenant_id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (!row.route_id) {
      return NextResponse.json({
        success: true,
        trip_active: false,
        trip: null,
        live: null,
        next_stop: null,
        eta: null,
        next_trip: null,
        transit_status: parentChildStatusFromSources({
          transitStatus: row.transit_status,
          tripActive: false,
        }),
      });
    }

    const { data: tripRows } = await db
      .from("trips")
      .select(
        "id, status, route_id, vehicle_id, driver_id, conductor_1_id, schedule:schedules(direction), vehicle:vehicles(license_plate), driver:profiles!trips_driver_id_fkey(name, phone, avatar_url), conductor:profiles!trips_conductor_1_id_fkey(name, phone, avatar_url)"
      )
      .eq("route_id", row.route_id)
      .eq("tenant_id", parent.tenant_id)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1);

    const trip = (tripRows?.[0] as Record<string, unknown> | undefined) ?? null;
    const tripStatus = typeof trip?.status === "string" ? trip.status : null;
    const tripActive = isInProgressTrip(tripStatus);
    const direction = nestedDirection(trip?.schedule);
    const tripId = typeof trip?.id === "string" ? trip.id : null;

    let attendance: string | null = null;
    if (tripActive && tripId) {
      const { data: manifest } = await db
        .from("trip_manifests")
        .select("attendance")
        .eq("trip_id", tripId)
        .eq("student_id", student_id)
        .eq("tenant_id", parent.tenant_id)
        .maybeSingle();
      if (manifest && typeof manifest.attendance === "string") {
        attendance = manifest.attendance;
      }
    }

    let nextTrip: ParentNextTripPayload | null = null;
    let statusDirection = direction;
    if (!tripActive) {
      nextTrip = await resolveNextTrip({
        db,
        tenantId: parent.tenant_id,
        routeId: row.route_id,
      });
      statusDirection = nextTrip?.direction ?? direction;
    }

    const childStatus = parentChildStatusFromSources({
      attendance,
      transitStatus: row.transit_status,
      direction: statusDirection,
      tripActive,
    });

    const { data: liveRows } = await db
      .from("live_coordinates")
      .select("coordinates, speed, bearing, is_emergency, created_at")
      .eq("route_id", row.route_id)
      .eq("tenant_id", parent.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1);

    const liveRow = (liveRows?.[0] as Record<string, unknown> | undefined) ?? null;
    const point = parseLiveCoordinates(liveRow?.coordinates);

    const stopId = childStopIdForDirection(direction, row.pickup_stop_id, row.dropoff_stop_id);
    let nextStop: { id: string; name: string } | null = null;
    if (stopId) {
      const { data: stop } = await db
        .from("stops")
        .select("id, name")
        .eq("id", stopId)
        .eq("tenant_id", parent.tenant_id)
        .maybeSingle();
      if (stop && typeof stop.name === "string") {
        nextStop = { id: stop.id as string, name: stop.name };
      }
    }

    let eta: Record<string, unknown> | null = null;
    if (stopId && tripActive && tripId) {
      const { data: etaRows } = await db
        .from("trip_stop_etas")
        .select("stop_id, route_id, trip_id, predicted_arrival, delay_seconds, updated_at")
        .eq("route_id", row.route_id)
        .eq("stop_id", stopId)
        .eq("trip_id", tripId)
        .eq("tenant_id", parent.tenant_id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const etaRow = etaRows?.[0] as
        | {
            stop_id: string;
            predicted_arrival: string;
            delay_seconds: number;
            updated_at: string;
          }
        | undefined;
      const etaMinutes = etaRow
        ? etaMinutesFromPredictedArrival(etaRow.predicted_arrival)
        : null;
      if (etaRow && etaMinutes != null) {
        eta = {
          stop_id: etaRow.stop_id,
          predicted_arrival: etaRow.predicted_arrival,
          delay_seconds: etaRow.delay_seconds,
          eta_minutes: etaMinutes,
          updated_at: etaRow.updated_at,
        };
      }
    }

    return NextResponse.json({
      success: true,
      trip_active: tripActive,
      trip: tripActive
        ? {
            id: tripId,
            direction,
            vehicle_plate: nestedPlate(trip?.vehicle),
            driver_name: nestedName(trip?.driver),
            driver: parentCrewContactFromProfile(trip?.driver),
            conductor: parentCrewContactFromProfile(trip?.conductor),
          }
        : null,
      live:
        tripActive && point
          ? {
              lat: point.lat,
              lng: point.lng,
              speed: typeof liveRow?.speed === "number" ? liveRow.speed : Number(liveRow?.speed ?? 0),
              bearing:
                typeof liveRow?.bearing === "number" ? liveRow.bearing : Number(liveRow?.bearing ?? 0),
              is_emergency: liveRow?.is_emergency === true,
              updated_at: liveRow?.created_at ?? null,
            }
          : null,
      next_stop: tripActive ? nextStop : null,
      eta,
      next_trip: tripActive ? null : nextTrip,
      transit_status: childStatus,
      attendance: tripActive ? attendance : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
