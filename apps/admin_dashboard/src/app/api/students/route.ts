import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { getLocalStudents, saveLocalStudents } from "@/lib/jsonDb";

const guardianSchema = z.object({
  name: z.string().min(2, "Guardian name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number is too short"),
});

const studentCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  route_id: z.string().min(1, "Invalid Route selection"),
  nfc_card_hash: z.string().min(4, "NFC Card Hash must be at least 4 characters").optional().or(z.literal("")).nullable(),
  pickup_stop_id: z.string().min(1, "Invalid Pickup Stop selection").nullable(),
  dropoff_stop_id: z.string().min(1, "Invalid Drop-off Stop selection").nullable(),
  schedule_ids: z.array(z.string()).default([]),
  status: z.enum(["Present", "Absent"]).default("Present"),
  guardians: z.array(guardianSchema).min(1, "At least one guardian is required").max(3, "Maximum of 3 guardians"),
  grade: z.string().optional().or(z.literal("")),
  class_name: z.string().optional().or(z.literal("")),
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
    route: { name: "Morning Route 1 (Kileleshwa)" }
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
    route: { name: "Morning Route 2 (Westlands)" }
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
    route: { name: "Morning Route 4 (Kilimani)" }
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
    route: { name: "Morning Route 1 (Kileleshwa)" }
  }
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: getLocalStudents() });
    }

    const client = getSupabaseClient(token);
    
    // Fetch students from database
    const { data: students, error: studentsError } = await client
      .from("students")
      .select("id, name, route_id, nfc_card_hash, pickup_stop_id, dropoff_stop_id, schedule_ids, guardians, status, grade, class_name");

    if (studentsError) {
      console.warn("Supabase students fetch error:", studentsError.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: getLocalStudents() });
    }

    const studentsList = students && students.length > 0 ? students : [];
    if (studentsList.length === 0) {
      return NextResponse.json({ success: true, source: "supabase_empty_fallback", data: getLocalStudents() });
    }

    // Fetch routes in parallel for manual client-side mapping
    const { data: routesData } = await client.from("routes").select("id, name");
    const routesMap = new Map((routesData || []).map(r => [r.id, r]));

    const mappedStudents = studentsList.map(student => {
      // Resolve guardians column (it could be stored as JSONB string or parsed array object)
      let parsedGuardians = [];
      if (student.guardians) {
        parsedGuardians = typeof student.guardians === "string" 
          ? JSON.parse(student.guardians) 
          : student.guardians;
      }

      return {
        ...student,
        guardians: parsedGuardians,
        status: student.status || "Present",
        route: routesMap.get(student.route_id) || null
      };
    });

    return NextResponse.json({ success: true, source: "supabase", data: mappedStudents });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = studentCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const generatedId = `std-${Math.floor(Math.random() * 1000)}`;
      const newMockStudent = {
        id: generatedId,
        name: result.data.name,
        route_id: result.data.route_id,
        nfc_card_hash: result.data.nfc_card_hash || null,
        pickup_stop_id: result.data.pickup_stop_id,
        dropoff_stop_id: result.data.dropoff_stop_id,
        schedule_ids: result.data.schedule_ids,
        status: result.data.status,
        guardians: result.data.guardians,
        grade: result.data.grade || null,
        class_name: result.data.class_name || null,
      };
      
      const localStudents = getLocalStudents();
      localStudents.push(newMockStudent);
      saveLocalStudents(localStudents);

      return NextResponse.json({ success: true, source: "mock", data: newMockStudent });
    }

    const client = getSupabaseClient(token);

    // Get tenant ID
    let tenantId = "8c9ad841-f762-4217-a021-9876251b5bcf";
    const { data: tenants } = await client.from("tenants").select("id").limit(1);
    if (tenants && tenants.length > 0) {
      tenantId = tenants[0].id;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: result.data.name,
      route_id: result.data.route_id,
      nfc_card_hash: result.data.nfc_card_hash || null,
      pickup_stop_id: result.data.pickup_stop_id,
      dropoff_stop_id: result.data.dropoff_stop_id,
      schedule_ids: result.data.schedule_ids,
      status: result.data.status,
      guardians: result.data.guardians,
      grade: result.data.grade || null,
      class_name: result.data.class_name || null,
    };

    const { data: studentInsert, error } = await client
      .from("students")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase student insert error, falling back to mock save:", error.message);
      
      const mockStudent = {
        ...payload
      };

      const localStudents = getLocalStudents();
      localStudents.push(mockStudent);
      saveLocalStudents(localStudents);

      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockStudent });
    }

    return NextResponse.json({ success: true, source: "supabase", data: studentInsert });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

