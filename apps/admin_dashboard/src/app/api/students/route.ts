import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { getLocalStudents, saveLocalStudents } from "@/lib/jsonDb";
import {
  demoReadonlyForbiddenResponse,
  getCallerProfile,
  isDemoReadonly,
} from "@/lib/authApi";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { duplicateGuardianPhoneError, attachGuardianPhotos, parentPhotoIndex } from "@/lib/studentGuardians";
import { studentDbWriteFields } from "@/lib/studentRecord";
import { ensureParentProfilesFromGuardians } from "@/lib/ensureParentProfiles";
import { syncTodayScheduledManifestsForSchedules } from "@/lib/scheduledTripManifest";

const guardianSchema = z.object({
  name: z.string().min(2, "Guardian name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number is too short"),
  email: z.string().trim().email("Guardian email is required"),
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
      { name: "James Mwangi", phone: "+254 700 111 222", email: "james.mwangi@parent.com" },
      { name: "Sarah Mwangi", phone: "+254 700 111 333", email: "sarah.mwangi@parent.com" }
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
      { name: "Mary Kamau", phone: "+254 711 222 333", email: "mary.kamau@parent.com" }
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
      { name: "Alice Ochieng", phone: "+254 722 333 444", email: "alice.ochieng@parent.com" }
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
      { name: "Robert Ndwiga", phone: "+254 733 444 555", email: "robert.ndwiga@parent.com" }
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

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    
    const { data: students, error: studentsError } = await client
      .from("students")
      .select("id, name, route_id, nfc_card_hash, pickup_stop_id, dropoff_stop_id, schedule_ids, guardians, status, grade, class_name")
      .eq("tenant_id", scope.tenantId);

    if (studentsError) {
      console.warn("Supabase students fetch error:", studentsError.message);
      return NextResponse.json({ success: false, error: "Failed to load students" }, { status: 500 });
    }

    const studentsList = students ?? [];

    const { data: routesData } = await client
      .from("routes")
      .select("id, name")
      .eq("tenant_id", scope.tenantId);
    const routesMap = new Map((routesData || []).map(r => [r.id, r]));

    const { data: parentsData } = await client
      .from("profiles")
      .select("phone, avatar_url")
      .eq("role", "parent")
      .eq("tenant_id", scope.tenantId);
    const parentsByPhone = parentPhotoIndex(parentsData ?? []);

    const mappedStudents = studentsList.map(student => {
      // Resolve guardians column (it could be stored as JSONB string or parsed array object)
      let parsedGuardians: unknown = [];
      if (student.guardians) {
        parsedGuardians = typeof student.guardians === "string" 
          ? JSON.parse(student.guardians) 
          : student.guardians;
      }

      return {
        ...student,
        guardians: attachGuardianPhotos(parsedGuardians, parentsByPhone),
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
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const body: unknown = await request.json();
    const result = studentCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const duplicatePhone = duplicateGuardianPhoneError(result.data.guardians);
    if (duplicatePhone) {
      return NextResponse.json(
        { success: false, errors: { guardians: [duplicatePhone] } },
        { status: 400 }
      );
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

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

    const payload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      ...studentDbWriteFields(result.data),
    };

    const ensured = await ensureParentProfilesFromGuardians(
      client,
      tenantId,
      result.data.guardians
    );
    if (!ensured.ok) {
      return NextResponse.json(
        { success: false, error: ensured.error },
        { status: 400 }
      );
    }
    if (ensured.parentId) payload.parent_id = ensured.parentId;

    const { data: studentInsert, error } = await client
      .from("students")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Supabase student insert error:", error.message);
      return NextResponse.json({ success: false, error: "Failed to register student" }, { status: 500 });
    }

    if (result.data.schedule_ids.length > 0) {
      await syncTodayScheduledManifestsForSchedules(client, {
        tenantId,
        scheduleIds: result.data.schedule_ids,
      });
    }

    return NextResponse.json({ success: true, source: "supabase", data: studentInsert });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

