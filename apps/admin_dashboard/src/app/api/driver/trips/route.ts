import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

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

    const client = getSupabaseClient();

    let vehicleId = vehicleIdParam;
    
    // Resolve vehicle_id from driver_id if not directly provided
    if (!vehicleId && driverId) {
      const { data: vehicleData } = await client
        .from("vehicles")
        .select("id")
        .eq("active_driver_id", driverId)
        .limit(1);
      
      if (vehicleData && vehicleData.length > 0) {
        vehicleId = vehicleData[0].id;
      } else {
        // Try staff status / conductor check
        const { data: conductorVehicle } = await client
          .from("vehicles")
          .select("id")
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

    // Fetch schedules for the vehicle
    const { data: schedules, error: schedulesError } = await client
      .from("schedules")
      .select("id, tenant_id, route_id, name, departure_time, direction, target_grades")
      .eq("vehicle_id", vehicleId);

    if (schedulesError) {
      console.error("Failed to fetch schedules for vehicle:", schedulesError.message);
      return NextResponse.json({ success: false, error: schedulesError.message }, { status: 500 });
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        server_time: serverTime,
        data: []
      });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Ensure a trip exists for today for each schedule
    for (const schedule of schedules) {
      const { data: existingTrip } = await client
        .from("trips")
        .select("id")
        .eq("schedule_id", schedule.id)
        .eq("trip_date", todayStr)
        .limit(1);

      if (!existingTrip || existingTrip.length === 0) {
        // Generate trip automatically!
        const tripId = crypto.randomUUID();
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

        if (!insertErr) {
          // Snap students associated with this schedule and insert manifest entries
          const { data: students } = await client
            .from("students")
            .select("id")
            .contains("schedule_ids", [schedule.id]);

          if (students && students.length > 0) {
            const manifestPayloads = students.map(std => ({
              id: crypto.randomUUID(),
              tenant_id: schedule.tenant_id,
              trip_id: tripId,
              student_id: std.id,
              attendance: "pending"
            }));

            await client
              .from("trip_manifests")
              .insert(manifestPayloads);
          }
        } else {
          console.error("Error creating auto-trip:", insertErr.message);
        }
      }
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
      .eq("trip_date", todayStr);

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
        .eq("route_id", (trip.route as any).id);

      // Fetch students count for trip manifest
      const { count: studentsCount } = await client
        .from("trip_manifests")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", trip.id);

      const resolvedStopsCount = stopsCount || 0;
      const resolvedStudentsCount = studentsCount || 0;

      processedTrips.push({
        ...trip,
        stops_count: resolvedStopsCount,
        students_count: resolvedStudentsCount,
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
