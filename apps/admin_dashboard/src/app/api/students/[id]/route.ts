import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { resolveRequestDb } from "@/lib/driverSession";
import { z } from "zod";
import { getLocalStudents, saveLocalStudents } from "@/lib/jsonDb";
import {
  demoReadonlyForbiddenResponse,
  getCallerProfile,
  isDemoReadonly,
} from "@/lib/authApi";
import { haversineDistanceMeters, parseGeoPoint } from "@/lib/geoUtils";

const guardianSchema = z.object({
  name: z.string().min(2, "Guardian name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number is too short"),
});

const studentUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  route_id: z.string().min(1, "Invalid Route selection").optional(),
  nfc_card_hash: z.string().min(4, "NFC Card Hash must be at least 4 characters").optional().or(z.literal("")).nullable(),
  pickup_stop_id: z.string().min(1).nullable().optional(),
  dropoff_stop_id: z.string().min(1).nullable().optional(),
  schedule_ids: z.array(z.string()).optional(),
  status: z.enum(["Present", "Absent"]).optional(),
  guardians: z.array(guardianSchema).min(1).max(3).optional(),
  grade: z.string().optional().or(z.literal("")).nullable(),
  class_name: z.string().optional().or(z.literal("")).nullable(),
  address: z.string().optional().or(z.literal("")).nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const mockStudents = [
  {
    id: "std-1",
    name: "Liam Mwangi",
    route_id: "route-1",
    nfc_card_hash: "A1B2C3D4",
    status: "Present",
    grade: "Grade 4",
    class_name: "4 Blue",
    pickup_stop_id: "stop-1-1",
    dropoff_stop_id: "stop-1-2",
    schedule_ids: ["sched-1-1", "sched-1-3"],
    guardians: [
      { name: "James Mwangi", phone: "+254 700 111 222" },
      { name: "Sarah Mwangi", phone: "+254 700 111 333" }
    ],
  },
  {
    id: "std-2",
    name: "Emma Kamau",
    route_id: "route-2",
    nfc_card_hash: "E5F6G7H8",
    status: "Present",
    grade: "Grade 3",
    class_name: "3 Red",
    pickup_stop_id: "stop-2-1",
    dropoff_stop_id: "stop-2-2",
    schedule_ids: ["sched-2-1"],
    guardians: [
      { name: "Mary Kamau", phone: "+254 711 222 333" }
    ],
  },
  {
    id: "std-3",
    name: "Noah Ochieng",
    route_id: "route-4",
    nfc_card_hash: "I9J0K1L2",
    status: "Absent",
    grade: "Grade 5",
    class_name: "5 Yellow",
    pickup_stop_id: "stop-4-1",
    dropoff_stop_id: "stop-4-2",
    schedule_ids: ["sched-4-1"],
    guardians: [
      { name: "Alice Ochieng", phone: "+254 722 333 444" }
    ],
  },
  {
    id: "std-4",
    name: "Ava Ndwiga",
    route_id: "route-1",
    nfc_card_hash: "M3N4O5P6",
    status: "Present",
    grade: "Grade 4",
    class_name: "4 Blue",
    pickup_stop_id: "stop-1-2",
    dropoff_stop_id: "stop-1-1",
    schedule_ids: ["sched-1-2", "sched-1-4"],
    guardians: [
      { name: "Robert Ndwiga", phone: "+254 733 444 555" }
    ],
  }
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const student = getLocalStudents().find(s => s.id === id);
      if (!student) {
        return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, source: "mock", data: student });
    }

    const client = getSupabaseClient(token);

    const { data: student, error } = await client
      .from("students")
      .select("id, name, route_id, nfc_card_hash, pickup_stop_id, dropoff_stop_id, schedule_ids, guardians, status, grade, class_name")
      .eq("id", id)
      .single();

    if (error) {
      console.warn(`Supabase student fetch error for ${id}:`, error.message);
      const student = getLocalStudents().find(s => s.id === id);
      if (!student) {
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: student });
    }

    let parsedGuardians = [];
    if (student.guardians) {
      parsedGuardians = typeof student.guardians === "string" 
        ? JSON.parse(student.guardians) 
        : student.guardians;
    }

    const mappedStudent = {
      ...student,
      guardians: parsedGuardians,
      status: student.status || "Present"
    };

    return NextResponse.json({ success: true, source: "supabase", data: mappedStudent });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const { id } = await params;
    const body: unknown = await request.json();
    const result = studentUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const localStudents = getLocalStudents();
      const idx = localStudents.findIndex((s: any) => s.id === id);
      if (idx !== -1) {
        localStudents[idx] = { ...localStudents[idx], ...result.data };
        saveLocalStudents(localStudents);
        return NextResponse.json({ success: true, source: "mock", data: localStudents[idx] });
      }
      return NextResponse.json({ success: false, error: "Student not found in mock list" }, { status: 404 });
    }

    const db = await resolveRequestDb(request);
    if (!db) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const client = db.client;

    // Drivers may only flip attendance status
    if (db.mode === "driver") {
      const allowedKeys = Object.keys(result.data);
      if (allowedKeys.some((k) => k !== "status")) {
        return NextResponse.json(
          { success: false, error: "Drivers may only update student attendance status" },
          { status: 403 }
        );
      }

      // Enforce stop geofence: board at pickup stop, drop at dropoff stop.
      if (result.data.status) {
        const { data: existingStudent, error: existingError } = await client
          .from("students")
          .select("id, route_id, pickup_stop_id, dropoff_stop_id")
          .eq("id", id)
          .single();

        if (existingError || !existingStudent) {
          return NextResponse.json(
            { success: false, error: existingError?.message ?? "Student not found" },
            { status: 404 }
          );
        }

        const requiredStopId =
          result.data.status === "Present"
            ? existingStudent.pickup_stop_id
            : existingStudent.dropoff_stop_id;

        if (requiredStopId) {
          const { data: stopRow, error: stopError } = await client
            .from("stops")
            .select("id, name, location, geofence_radius_meters")
            .eq("id", requiredStopId)
            .single();

          if (stopError || !stopRow) {
            return NextResponse.json(
              { success: false, error: "Assigned stop not found for attendance action" },
              { status: 400 }
            );
          }

          const stopPoint = parseGeoPoint(stopRow.location);
          if (!stopPoint) {
            return NextResponse.json(
              { success: false, error: "Assigned stop has invalid coordinates" },
              { status: 400 }
            );
          }

          const { data: liveRows, error: liveError } = await client
            .from("live_coordinates")
            .select("coordinates, created_at")
            .eq("route_id", existingStudent.route_id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (liveError || !liveRows || liveRows.length === 0) {
            return NextResponse.json(
              {
                success: false,
                error: "No live bus location available. Start the trip and wait for GPS before boarding.",
              },
              { status: 403 }
            );
          }

          const busPoint = parseGeoPoint(liveRows[0].coordinates);
          if (!busPoint) {
            return NextResponse.json(
              { success: false, error: "Live bus location could not be parsed" },
              { status: 403 }
            );
          }

          const radius =
            typeof stopRow.geofence_radius_meters === "number" && stopRow.geofence_radius_meters >= 5
              ? stopRow.geofence_radius_meters
              : 50;
          const distance = haversineDistanceMeters(
            busPoint.lat,
            busPoint.lng,
            stopPoint.lat,
            stopPoint.lng
          );

          if (distance > radius) {
            return NextResponse.json(
              {
                success: false,
                error: `Bus must be at ${stopRow.name ?? "the assigned stop"} to update attendance (within ${radius}m).`,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    // Build update payload dynamically
    const updatePayload: Record<string, any> = {};
    if (result.data.name !== undefined) updatePayload.name = result.data.name;
    if (result.data.route_id !== undefined) updatePayload.route_id = result.data.route_id;
    if (result.data.nfc_card_hash !== undefined) updatePayload.nfc_card_hash = result.data.nfc_card_hash || null;
    if (result.data.guardians !== undefined) updatePayload.guardians = result.data.guardians;
    if (result.data.status !== undefined) updatePayload.status = result.data.status;
    if (result.data.grade !== undefined) updatePayload.grade = result.data.grade || null;
    if (result.data.class_name !== undefined) updatePayload.class_name = result.data.class_name || null;
    if (result.data.pickup_stop_id !== undefined) updatePayload.pickup_stop_id = result.data.pickup_stop_id;
    if (result.data.dropoff_stop_id !== undefined) updatePayload.dropoff_stop_id = result.data.dropoff_stop_id;
    if (result.data.schedule_ids !== undefined) updatePayload.schedule_ids = result.data.schedule_ids;
    if (result.data.address !== undefined) updatePayload.address = result.data.address || null;
    if (result.data.latitude !== undefined || result.data.longitude !== undefined) {
      const lat = result.data.latitude;
      const lng = result.data.longitude;
      if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
        updatePayload.pickup_location = `POINT(${lng} ${lat})`;
        updatePayload.latitude = lat;
        updatePayload.longitude = lng;
      }
    }

    const { data: studentUpdate, error } = await client
      .from("students")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.warn(`Supabase student update error for ${id}, falling back to mock:`, error.message);
      
      const localStudents = getLocalStudents();
      const idx = localStudents.findIndex((s: any) => s.id === id);
      if (idx !== -1) {
        localStudents[idx] = { ...localStudents[idx], ...result.data };
        saveLocalStudents(localStudents);
        return NextResponse.json({ success: true, source: "supabase_error_fallback", data: localStudents[idx] });
      }
      
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id, ...result.data } });
    }

    // Sync trip manifest attendance if student status changes and there is an active trip today
    if (result.data.status && studentUpdate) {
      const attendanceStatus = result.data.status === "Present" ? "boarded" : "dropped_off";
      const todayStr = new Date().toISOString().split("T")[0];
      
      const { data: activeTrips } = await client
        .from("trips")
        .select("id")
        .eq("route_id", studentUpdate.route_id)
        .eq("trip_date", todayStr)
        .eq("status", "in_progress");

      if (activeTrips && activeTrips.length > 0) {
        const tripIds = activeTrips.map(t => t.id);
        const updateData: Record<string, any> = { attendance: attendanceStatus };
        if (attendanceStatus === "boarded") {
          updateData.boarded_at = new Date().toISOString();
        } else {
          updateData.dropped_off_at = new Date().toISOString();
        }
        
        await client
          .from("trip_manifests")
          .update(updateData)
          .in("trip_id", tripIds)
          .eq("student_id", id);
      }
    }

    return NextResponse.json({ success: true, source: "supabase", data: studentUpdate });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const { id } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const localStudents = getLocalStudents();
      const updated = localStudents.filter((s: any) => s.id !== id);
      saveLocalStudents(updated);
      return NextResponse.json({ success: true, source: "mock" });
    }

    const client = getSupabaseClient(token);

    const { error } = await client
      .from("students")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn(`Supabase student delete error for ${id}, falling back to mock:`, error.message);
      
      const localStudents = getLocalStudents();
      const updated = localStudents.filter((s: any) => s.id !== id);
      saveLocalStudents(updated);

      return NextResponse.json({ success: true, source: "supabase_error_fallback" });
    }

    return NextResponse.json({ success: true, source: "supabase" });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

