import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import {
  DROPOFF_START_BLOCKED_MESSAGE,
  shouldBlockDropoffStart,
} from "@/lib/dropoffCampusBoarding";
import { durationSecondsFromRange } from "@/lib/schoolArrival";

const tripCreateSchema = z.object({
  schedule_id: z.string().min(1, "Invalid Schedule selection"),
  route_id: z.string().min(1, "Invalid Route selection"),
  vehicle_id: z.string().optional().nullable(),
  driver_id: z.string().optional().nullable(),
  conductor_1_id: z.string().optional().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("in_progress"),
  status_override: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  custom_departure_time: z.string().optional().nullable(),
});

const manifestUpdateSchema = z.object({
  manifest_id: z.string().optional(),
  trip_id: z.string().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  student_id: z.string().optional(),
  attendance: z.enum(["pending", "boarded", "dropped_off", "absent", "no_show"]).optional(),
  finalize_campus_boarding: z.boolean().optional(),
  status_override: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  custom_departure_time: z.string().optional().nullable(),
});

export const mockScheduleDirections: Record<string, string> = {
  "sched-1-1": "HOME_TO_SCHOOL",
  "sched-dropoff": "SCHOOL_TO_HOME",
};

export const mockTrips = [
  {
    id: "trip-1",
    schedule_id: "sched-1-1",
    route_id: "route-1",
    vehicle_id: "veh-1",
    driver_id: "driver-1",
    conductor_1_id: "cond-1",
    trip_date: "2026-06-21",
    status: "in_progress",
    started_at: "2026-06-21T06:35:00Z",
    completed_at: null,
  },
  {
    id: "trip-dropoff",
    schedule_id: "sched-dropoff",
    route_id: "route-1",
    vehicle_id: "veh-1",
    driver_id: "driver-1",
    conductor_1_id: "cond-1",
    trip_date: "2026-06-21",
    status: "scheduled",
    started_at: null,
    completed_at: null,
  },
  {
    id: "trip-dropoff-ready",
    schedule_id: "sched-dropoff",
    route_id: "route-1",
    vehicle_id: "veh-1",
    driver_id: "driver-1",
    conductor_1_id: "cond-1",
    trip_date: "2026-06-21",
    status: "scheduled",
    started_at: null,
    completed_at: null,
  },
];

export const mockTripManifests = [
  {
    id: "manifest-1-1",
    trip_id: "trip-1",
    student_id: "std-1",
    attendance: "boarded",
    boarded_at: "2026-06-21T06:40:00Z",
    dropped_off_at: null,
    student: {
      id: "std-1",
      name: "Liam Mwangi",
      grade: "Grade 4",
      class_name: "4 Blue",
      pickup_stop_id: "stop-1-1",
      dropoff_stop_id: "stop-1-2"
    }
  },
  {
    id: "manifest-1-2",
    trip_id: "trip-1",
    student_id: "std-4",
    attendance: "pending",
    boarded_at: null,
    dropped_off_at: null,
    student: {
      id: "std-4",
      name: "Ava Ndwiga",
      grade: "Grade 4",
      class_name: "4 Blue",
      pickup_stop_id: "stop-1-2",
      dropoff_stop_id: "stop-1-1"
    }
  },
  {
    id: "manifest-dropoff-1",
    trip_id: "trip-dropoff",
    student_id: "std-1",
    attendance: "pending",
    boarded_at: null,
    dropped_off_at: null,
    student: {
      id: "std-1",
      name: "Liam Mwangi",
      grade: "Grade 4",
      class_name: "4 Blue",
      pickup_stop_id: "stop-1-1",
      dropoff_stop_id: "stop-1-2"
    }
  },
  {
    id: "manifest-dropoff-ready-1",
    trip_id: "trip-dropoff-ready",
    student_id: "std-1",
    attendance: "boarded",
    boarded_at: "2026-06-21T14:05:00Z",
    dropped_off_at: null,
    student: {
      id: "std-1",
      name: "Liam Mwangi",
      grade: "Grade 4",
      class_name: "4 Blue",
      pickup_stop_id: "stop-1-1",
      dropoff_stop_id: "stop-1-2"
    }
  },
  {
    id: "manifest-dropoff-ready-2",
    trip_id: "trip-dropoff-ready",
    student_id: "std-4",
    attendance: "absent",
    boarded_at: null,
    dropped_off_at: null,
    student: {
      id: "std-4",
      name: "Ava Ndwiga",
      grade: "Grade 4",
      class_name: "4 Blue",
      pickup_stop_id: "stop-1-2",
      dropoff_stop_id: "stop-1-1"
    }
  }
];

function mockDirectionForTrip(tripId: string): string {
  const trip = mockTrips.find((row) => row.id === tripId);
  if (!trip) return "HOME_TO_SCHOOL";
  return mockScheduleDirections[trip.schedule_id] ?? "HOME_TO_SCHOOL";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("trip_id");
    const scheduleId = searchParams.get("schedule_id");

    if (!isSupabaseConfigured) {
      if (tripId) {
        const manifests = mockTripManifests.filter(m => m.trip_id === tripId);
        return NextResponse.json({ success: true, source: "mock", data: manifests });
      }
      let filteredTrips = mockTrips;
      if (scheduleId) {
        filteredTrips = mockTrips.filter(t => t.schedule_id === scheduleId);
      }
      return NextResponse.json({ success: true, source: "mock", data: filteredTrips });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    if (tripId) {
      // Get detailed manifest of a trip
      const { data: manifests, error: manifestError } = await client
        .from("trip_manifests")
        .select(`
          id,
          trip_id,
          student_id,
          attendance,
          boarded_at,
          dropped_off_at,
          student:students (
            id,
            name,
            grade,
            class_name,
            pickup_stop_id,
            dropoff_stop_id,
            guardians
          )
        `)
        .eq("trip_id", tripId)
        .eq("tenant_id", scope.tenantId);

      if (manifestError) {
        console.warn("Supabase fetch manifest error:", manifestError.message);
        return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockTripManifests.filter(m => m.trip_id === tripId) });
      }

      return NextResponse.json({ success: true, source: "supabase", data: manifests || [] });
    }

    // List all trips
    let query = client.from("trips").select("id, tenant_id, schedule_id, route_id, vehicle_id, driver_id, conductor_1_id, trip_date, status, started_at, completed_at, duration_seconds, created_at, status_override, description, custom_departure_time").eq("tenant_id", scope.tenantId);
    
    if (scheduleId) {
      query = query.eq("schedule_id", scheduleId);
    }

    const { data: trips, error: tripsError } = await query.order("trip_date", { ascending: false });

    if (tripsError) {
      console.warn("Supabase fetch trips error:", tripsError.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockTrips });
    }

    return NextResponse.json({ success: true, source: "supabase", data: trips || [] });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = tripCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      const tripId = `trip-${Math.floor(Math.random() * 1000)}`;
      const newMockTrip = {
        id: tripId,
        schedule_id: result.data.schedule_id,
        route_id: result.data.route_id,
        vehicle_id: result.data.vehicle_id || null,
        driver_id: result.data.driver_id || null,
        conductor_1_id: result.data.conductor_1_id || null,
        trip_date: new Date().toISOString().split("T")[0],
        status: result.data.status,
        started_at: result.data.status === "in_progress" ? new Date().toISOString() : null,
        completed_at: null,
      };

      // Mock manifest generation based on students assigned to route
      // (This matches the frontend students list filtered to route_id or schedule_ids)
      const mockNewManifests = [
        {
          id: `manifest-${Math.floor(Math.random() * 1000)}`,
          trip_id: tripId,
          student_id: "std-1",
          attendance: "pending" as const,
          boarded_at: null,
          dropped_off_at: null,
          student: {
            id: "std-1",
            name: "Liam Mwangi",
            grade: "Grade 4",
            class_name: "4 Blue",
            pickup_stop_id: "stop-1-1",
            dropoff_stop_id: "stop-1-2"
          }
        }
      ];

      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          trip: newMockTrip,
          manifests: mockNewManifests
        }
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

    const { data: ownedSchedule } = await client
      .from("schedules")
      .select("id")
      .eq("id", result.data.schedule_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!ownedSchedule) {
      return NextResponse.json({ success: false, error: "Schedule not found" }, { status: 404 });
    }

    const { data: ownedRoute } = await client
      .from("routes")
      .select("id")
      .eq("id", result.data.route_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!ownedRoute) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
    }

    const tripId = crypto.randomUUID();
    const tripPayload = {
      id: tripId,
      tenant_id: tenantId,
      schedule_id: result.data.schedule_id,
      route_id: result.data.route_id,
      vehicle_id: result.data.vehicle_id || null,
      driver_id: result.data.driver_id || null,
      conductor_1_id: result.data.conductor_1_id || null,
      status: result.data.status,
      started_at: result.data.status === "in_progress" ? new Date().toISOString() : null,
      trip_date: new Date().toISOString().split("T")[0],
      status_override: result.data.status_override || null,
      description: result.data.description || null,
      custom_departure_time: result.data.custom_departure_time || null,
    };

    const { data: tripInsert, error: tripInsertError } = await client
      .from("trips")
      .insert(tripPayload)
      .select()
      .single();

    if (tripInsertError) {
      console.warn("Supabase trip insert error:", tripInsertError.message);
      return NextResponse.json({ success: false, error: tripInsertError.message }, { status: 400 });
    }

    // Now snap students associated with this schedule_id
    const { data: students, error: studentsError } = await client
      .from("students")
      .select("id, name, grade, class_name, pickup_stop_id, dropoff_stop_id")
      .eq("tenant_id", tenantId)
      .contains("schedule_ids", [result.data.schedule_id]);

    if (studentsError) {
      console.warn("Supabase query students for schedule error:", studentsError.message);
    }

    const manifestsInserted = [];
    if (students && students.length > 0) {
      const manifestPayloads = students.map(std => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        trip_id: tripId,
        student_id: std.id,
        attendance: "pending" as const
      }));

      const { data: manifestInsert, error: manifestInsertError } = await client
        .from("trip_manifests")
        .insert(manifestPayloads)
        .select(`
          id,
          trip_id,
          student_id,
          attendance,
          boarded_at,
          dropped_off_at,
          student:students (
            id,
            name,
            grade,
            class_name,
            pickup_stop_id,
            dropoff_stop_id
          )
        `);

      if (manifestInsertError) {
        console.warn("Supabase manifests insert error:", manifestInsertError.message);
      } else {
        manifestsInserted.push(...(manifestInsert || []));
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        trip: tripInsert,
        manifests: manifestsInserted
      }
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = manifestUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      if (result.data.trip_id && result.data.finalize_campus_boarding) {
        const updated = mockTripManifests
          .filter((row) => row.trip_id === result.data.trip_id)
          .map((row) => ({
            ...row,
            attendance: row.attendance === "pending" ? "absent" : row.attendance,
          }));
        return NextResponse.json({ success: true, source: "mock", data: updated });
      }
      if (result.data.trip_id && result.data.status === "in_progress") {
        const manifests = mockTripManifests.filter((row) => row.trip_id === result.data.trip_id);
        if (
          shouldBlockDropoffStart({
            direction: mockDirectionForTrip(result.data.trip_id),
            manifests,
          })
        ) {
          return NextResponse.json(
            { success: false, error: DROPOFF_START_BLOCKED_MESSAGE },
            { status: 409 }
          );
        }
        console.log(`[Notification Simulator] All parents of students on trip ${result.data.trip_id}'s route have been notified: Bus has left school.`);
      }
      if (result.data.trip_id && result.data.status === "completed") {
        const mockTrip = mockTrips.find((row) => row.id === result.data.trip_id);
        const completedAt = new Date();
        return NextResponse.json({
          success: true,
          source: "mock",
          data: {
            ...result.data,
            completed_at: completedAt.toISOString(),
            duration_seconds: durationSecondsFromRange(mockTrip?.started_at ?? null, completedAt),
          },
        });
      }
      const hasTripPatch =
        result.data.status !== undefined ||
        result.data.status_override !== undefined ||
        result.data.description !== undefined ||
        result.data.custom_departure_time !== undefined ||
        Boolean(result.data.manifest_id && result.data.attendance);
      if (result.data.trip_id && !hasTripPatch) {
        return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
      }
      return NextResponse.json({ success: true, source: "mock", data: result.data });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    if (result.data.manifest_id && result.data.attendance) {
      const updateData: Record<string, any> = { attendance: result.data.attendance };
      if (result.data.attendance === "boarded") {
        updateData.boarded_at = new Date().toISOString();
      } else if (result.data.attendance === "dropped_off") {
        updateData.dropped_off_at = new Date().toISOString();
      }

      const { data: manifestUpdate, error: manifestError } = await client
        .from("trip_manifests")
        .update(updateData)
        .eq("id", result.data.manifest_id)
        .eq("tenant_id", scope.tenantId)
        .select()
        .maybeSingle();

      if (manifestError) {
        return NextResponse.json({ success: false, error: manifestError.message }, { status: 400 });
      }

      if (!manifestUpdate) {
        return NextResponse.json({ success: false, error: "Manifest not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, source: "supabase", data: manifestUpdate });
    }

    if (result.data.trip_id && result.data.finalize_campus_boarding) {
      const { data: finalized, error: finalizeError } = await client
        .from("trip_manifests")
        .update({ attendance: "absent" })
        .eq("trip_id", result.data.trip_id)
        .eq("tenant_id", scope.tenantId)
        .eq("attendance", "pending")
        .select();

      if (finalizeError) {
        return NextResponse.json({ success: false, error: finalizeError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, source: "supabase", data: finalized ?? [] });
    }

    if (result.data.trip_id) {
      if (result.data.status === "in_progress") {
        const { data: tripRow, error: tripLookupError } = await client
          .from("trips")
          .select("id, schedule_id")
          .eq("id", result.data.trip_id)
          .eq("tenant_id", scope.tenantId)
          .maybeSingle();

        if (tripLookupError) {
          return NextResponse.json({ success: false, error: tripLookupError.message }, { status: 400 });
        }
        if (!tripRow) {
          return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
        }

        let direction = "HOME_TO_SCHOOL";
        if (tripRow.schedule_id) {
          const { data: schedule } = await client
            .from("schedules")
            .select("direction")
            .eq("id", tripRow.schedule_id)
            .maybeSingle();
          if (schedule && typeof schedule.direction === "string") {
            direction = schedule.direction;
          }
        }

        const { data: manifests, error: manifestLookupError } = await client
          .from("trip_manifests")
          .select("attendance")
          .eq("trip_id", result.data.trip_id)
          .eq("tenant_id", scope.tenantId);

        if (manifestLookupError) {
          return NextResponse.json({ success: false, error: manifestLookupError.message }, { status: 400 });
        }

        if (shouldBlockDropoffStart({ direction, manifests: manifests ?? [] })) {
          return NextResponse.json(
            { success: false, error: DROPOFF_START_BLOCKED_MESSAGE },
            { status: 409 }
          );
        }
      }

      const updateData: Record<string, string | number | null> = {};
      if (result.data.status !== undefined) {
        updateData.status = result.data.status;
        if (result.data.status === "in_progress") {
          updateData.started_at = new Date().toISOString();
        } else if (result.data.status === "completed") {
          const completedAt = new Date();
          updateData.completed_at = completedAt.toISOString();
          const { data: existingTrip } = await client
            .from("trips")
            .select("started_at")
            .eq("id", result.data.trip_id)
            .eq("tenant_id", scope.tenantId)
            .maybeSingle();
          const startedAt =
            existingTrip && typeof (existingTrip as { started_at?: string | null }).started_at === "string"
              ? (existingTrip as { started_at: string }).started_at
              : null;
          updateData.duration_seconds = durationSecondsFromRange(startedAt, completedAt);
        }
      }
      if (result.data.status_override !== undefined) {
        updateData.status_override = result.data.status_override;
      }
      if (result.data.description !== undefined) {
        updateData.description = result.data.description;
      }
      if (result.data.custom_departure_time !== undefined) {
        updateData.custom_departure_time = result.data.custom_departure_time;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
      }

      const { data: tripUpdate, error: tripError } = await client
        .from("trips")
        .update(updateData)
        .eq("id", result.data.trip_id)
        .eq("tenant_id", scope.tenantId)
        .select()
        .maybeSingle();

      if (tripError) {
        return NextResponse.json({ success: false, error: tripError.message }, { status: 400 });
      }

      if (!tripUpdate) {
        return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
      }

      await sendTripNotifications(client, tripUpdate);

      return NextResponse.json({ success: true, source: "supabase", data: tripUpdate });
    }

    return NextResponse.json({ success: false, error: "Missing manifest_id or trip_id to update" }, { status: 400 });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

async function sendTripNotifications(
  client: any, 
  trip: { 
    id: string; 
    tenant_id: string; 
    route_id: string; 
    driver_id?: string | null; 
    conductor_1_id?: string | null;
    status: string; 
    status_override?: string | null; 
    description?: string | null; 
    custom_departure_time?: string | null; 
  }
) {
  // If Supabase is active, notifications are handled by the database trigger on public.trips updates
  if (isSupabaseConfigured) {
    console.log("[API] Supabase active; skipping manual Next.js trip status notifications (handled by DB trigger).");
    return;
  }

  try {
    // 1. Fetch route details
    let routeName = "assigned route";
    const { data: routeData } = await client
      .from("routes")
      .select("name")
      .eq("id", trip.route_id)
      .single();
    if (routeData) {
      routeName = routeData.name;
    }

    // 2. Build custom message
    let customMsg = "";
    const statusLabel = trip.status_override || trip.status || "updated";
    if (statusLabel.toLowerCase().includes("delay") && trip.custom_departure_time) {
      customMsg = `Safaricom Track Alert: Today's trip on route ${routeName} is delayed. New scheduled departure time: ${trip.custom_departure_time}.`;
    } else if (statusLabel.toLowerCase() === "cancelled") {
      customMsg = `Safaricom Track Alert: Today's trip on route ${routeName} has been cancelled.`;
    } else if (trip.status === "in_progress") {
      customMsg = `Safaricom Track Alert: Today's trip on route ${routeName} has started. Bus is active on route.`;
    } else {
      customMsg = `Safaricom Track Alert: Today's trip on route ${routeName} status is now ${statusLabel}.`;
    }

    if (trip.description) {
      customMsg += ` Note: ${trip.description}`;
    }

    // 3. Query all students on this route
    const { data: students } = await client
      .from("students")
      .select("id, name, parent_id")
      .eq("route_id", trip.route_id)
      .eq("tenant_id", trip.tenant_id);

    if (students && students.length > 0) {
      const alertPayloads = students
        .filter((std: any) => std.parent_id)
        .map((std: any) => ({
          id: crypto.randomUUID(),
          tenant_id: trip.tenant_id,
          student_id: std.id,
          parent_id: std.parent_id,
          message_type: "proximity",
          custom_message: customMsg,
          processed: false
        }));

      if (alertPayloads.length > 0) {
        const { error: alertErr } = await client
          .from("alerts_queue")
          .insert(alertPayloads);
        if (alertErr) {
          console.warn("Failed to queue departure alerts for parents:", alertErr.message);
        }
      }
    }

    // 4. Log simulation to Driver & Conductor
    console.log(`[Notification Simulator] Dispatch alert sent to Driver (ID: ${trip.driver_id}) and Conductor (ID: ${trip.conductor_1_id}): ${customMsg}`);
  } catch (err) {
    console.error("Error sending trip notifications:", err);
  }
}
