import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { tallyManifestAttendance } from "@/lib/dropoffCampusBoarding";
import { syncScheduledTripIfNeeded } from "@/lib/scheduledTripManifest";

const mockDriverTrips = [
  {
    id: "trip-mock-1",
    status: "scheduled",
    started_at: null,
    completed_at: null,
    trip_date: new Date().toISOString().split("T")[0],
    schedule: {
      id: "sched-1-1",
      name: "Early AM Run (Lower Primary)",
      departure_time: "06:30:00",
      direction: "HOME_TO_SCHOOL",
      target_grades: ["Grade 1", "Grade 2", "Grade 3"]
    },
    route: {
      id: "route-1",
      name: "Morning Route 1",
      path: null
    },
    stops_count: 5,
    students_count: 12,
    pending_count: 12,
    boarded_count: 0,
    absent_count: 0,
    estimated_duration: 35
  },
  {
    id: "trip-mock-2",
    status: "scheduled",
    started_at: null,
    completed_at: null,
    trip_date: new Date().toISOString().split("T")[0],
    schedule: {
      id: "sched-1-3",
      name: "Early PM Run (Lower Primary)",
      departure_time: "15:30:00",
      direction: "SCHOOL_TO_HOME",
      target_grades: ["Grade 1", "Grade 2", "Grade 3"]
    },
    route: {
      id: "route-1",
      name: "Morning Route 1",
      path: null
    },
    stops_count: 5,
    students_count: 12,
    pending_count: 12,
    boarded_count: 0,
    absent_count: 0,
    estimated_duration: 35
  }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get("driver_id");
    const vehicleIdParam = searchParams.get("vehicle_id");

    const serverTime = new Date().toISOString();

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        server_time: serverTime,
        data: mockDriverTrips
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

    let vehicleId = vehicleIdParam;
    
    // Resolve vehicle_id from driver_id if not directly provided
    if (!vehicleId && driverId) {
      const { data: vehicleData } = await client
        .from("vehicles")
        .select("id")
        .eq("active_driver_id", driverId)
        .eq("tenant_id", tenantId)
        .limit(1);
      
      if (vehicleData && vehicleData.length > 0) {
        vehicleId = vehicleData[0].id;
      } else {
        // Try staff status / conductor check
        const { data: conductorVehicle } = await client
          .from("vehicles")
          .select("id")
          .eq("tenant_id", tenantId)
          .or(`conductor_1_id.eq.${driverId},conductor_2_id.eq.${driverId}`)
          .limit(1);
        if (conductorVehicle && conductorVehicle.length > 0) {
          vehicleId = conductorVehicle[0].id;
        }
      }
    }

    if (!vehicleId) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        server_time: serverTime,
        data: []
      });
    }

    const { data: ownedVehicle } = await client
      .from("vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!ownedVehicle) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        server_time: serverTime,
        data: []
      });
    }

    // Fetch schedules for the vehicle
    const { data: allSchedules, error: schedulesError } = await client
      .from("schedules")
      .select("id, tenant_id, route_id, name, departure_time, direction, target_grades, days_of_week")
      .eq("vehicle_id", vehicleId)
      .eq("tenant_id", tenantId);

    if (schedulesError) {
      console.error("Failed to fetch schedules for vehicle:", schedulesError.message);
      return NextResponse.json({ success: false, error: schedulesError.message }, { status: 500 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const jsDay = now.getDay(); // Sun=0 … Sat=6
    const dbDay = jsDay === 0 ? 7 : jsDay; // Mon=1 … Sat=6, Sun=7

    const schedules = (allSchedules ?? []).filter((schedule) => {
      const days = schedule.days_of_week as number[] | null;
      if (!days || days.length === 0) return true;
      return days.includes(dbDay);
    });

    if (schedules.length === 0) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        server_time: serverTime,
        data: []
      });
    }

    // Ensure a trip exists for today for each schedule that runs today
    for (const schedule of schedules) {
      const { data: existingTrip } = await client
        .from("trips")
        .select("id, status")
        .eq("schedule_id", schedule.id)
        .eq("trip_date", todayStr)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      let tripId = existingTrip?.id as string | undefined;
      let tripStatus = existingTrip?.status as string | undefined;

      if (!tripId) {
        tripId = crypto.randomUUID();
        tripStatus = "scheduled";
        const tripPayload = {
          id: tripId,
          tenant_id: schedule.tenant_id,
          schedule_id: schedule.id,
          route_id: schedule.route_id,
          vehicle_id: vehicleId,
          driver_id: driverId || null,
          status: "scheduled",
          trip_date: todayStr
        };

        const { error: insertErr } = await client
          .from("trips")
          .insert(tripPayload);

        if (insertErr) {
          console.error("Error creating auto-trip:", insertErr.message);
          continue;
        }
      }

      await syncScheduledTripIfNeeded(client, {
        tenantId,
        tripId,
        scheduleId: schedule.id,
        status: tripStatus,
      });
    }

    // Now query all trips for today for this vehicle
    const { data: trips, error: tripsError } = await client
      .from("trips")
      .select(`
        id,
        status,
        started_at,
        completed_at,
        trip_date,
        schedule:schedules (
          id,
          name,
          departure_time,
          direction,
          target_grades
        ),
        route:routes (
          id,
          name,
          path
        )
      `)
      .eq("vehicle_id", vehicleId)
      .eq("trip_date", todayStr)
      .eq("tenant_id", tenantId);

    if (tripsError) {
      console.error("Failed to fetch trips for vehicle:", tripsError.message);
      return NextResponse.json({ success: false, error: tripsError.message }, { status: 500 });
    }

    // Process counts for each trip
    const processedTrips = [];
    for (const trip of (trips || [])) {
      if (!trip.route || !trip.schedule) continue;

      // Fetch stops count for route
      const { count: stopsCount } = await client
        .from("stops")
        .select("id", { count: "exact", head: true })
        .eq("route_id", (trip.route as any).id)
        .eq("tenant_id", tenantId);

      const { data: manifestRows } = await client
        .from("trip_manifests")
        .select("attendance")
        .eq("trip_id", trip.id)
        .eq("tenant_id", tenantId);

      const tally = tallyManifestAttendance(manifestRows ?? []);
      const resolvedStopsCount = stopsCount || 0;
      const resolvedStudentsCount = tally.students_count;

      processedTrips.push({
        ...trip,
        stops_count: resolvedStopsCount,
        students_count: resolvedStudentsCount,
        pending_count: tally.pending_count,
        boarded_count: tally.boarded_count,
        absent_count: tally.absent_count,
        estimated_duration: (resolvedStopsCount * 4) + 15 + resolvedStudentsCount
      });
    }

    // Sort by departure_time
    processedTrips.sort((a, b) => {
      const timeA = (a.schedule as any)?.departure_time || "";
      const timeB = (b.schedule as any)?.departure_time || "";
      return timeA.localeCompare(timeB);
    });

    return NextResponse.json({
      success: true,
      source: "supabase",
      server_time: serverTime,
      data: processedTrips
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
