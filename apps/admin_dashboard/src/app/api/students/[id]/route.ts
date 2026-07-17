import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { getLocalStudents, saveLocalStudents } from "@/lib/jsonDb";

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

    const client = getSupabaseClient(token);

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

