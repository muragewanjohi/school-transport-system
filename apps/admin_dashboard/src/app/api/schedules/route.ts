import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const scheduleCreateSchema = z.object({
  route_id: z.string().min(1, "Invalid Route selection"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  departure_time: z.string().regex(/^([0-9]{2}):([0-9]{2})(:[0-9]{2})?$/, "Invalid time format (HH:MM or HH:MM:SS)"),
  direction: z.enum(["HOME_TO_SCHOOL", "SCHOOL_TO_HOME"]),
  target_grades: z.array(z.string()).min(1, "At least one target grade is required"),
  days_of_week: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  vehicle_id: z.string().uuid("Invalid vehicle UUID").nullable().optional(),
});

export const mockSchedules = [
  {
    id: "sched-1-1",
    route_id: "route-1",
    name: "Early AM Run (Lower Primary)",
    departure_time: "06:30:00",
    direction: "HOME_TO_SCHOOL",
    target_grades: ["Grade 1", "Grade 2", "Grade 3"],
    days_of_week: [1, 2, 3, 4, 5]
  },
  {
    id: "sched-1-2",
    route_id: "route-1",
    name: "Late AM Run (Upper Primary)",
    departure_time: "07:30:00",
    direction: "HOME_TO_SCHOOL",
    target_grades: ["Grade 4", "Grade 5", "Grade 6"],
    days_of_week: [1, 2, 3, 4, 5]
  },
  {
    id: "sched-1-3",
    route_id: "route-1",
    name: "Early PM Run (Lower Primary)",
    departure_time: "15:30:00",
    direction: "SCHOOL_TO_HOME",
    target_grades: ["Grade 1", "Grade 2", "Grade 3"],
    days_of_week: [1, 2, 3, 4, 5]
  },
  {
    id: "sched-1-4",
    route_id: "route-1",
    name: "Late PM Run (Upper Primary)",
    departure_time: "16:30:00",
    direction: "SCHOOL_TO_HOME",
    target_grades: ["Grade 4", "Grade 5", "Grade 6"],
    days_of_week: [1, 2, 3, 4, 5]
  },
  {
    id: "sched-2-1",
    route_id: "route-2",
    name: "AM Westlands Run",
    departure_time: "07:00:00",
    direction: "HOME_TO_SCHOOL",
    target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
    days_of_week: [1, 2, 3, 4, 5]
  },
  {
    id: "sched-4-1",
    route_id: "route-4",
    name: "AM Kilimani Run",
    departure_time: "07:15:00",
    direction: "HOME_TO_SCHOOL",
    target_grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
    days_of_week: [1, 2, 3, 4, 5]
  }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get("route_id");
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      let filtered = mockSchedules;
      if (routeId) {
        filtered = mockSchedules.filter(s => s.route_id === routeId);
      }
      return NextResponse.json({ success: true, source: "mock", data: filtered });
    }

    const client = getSupabaseClient(token);
    
    let query = client.from("schedules").select("id, tenant_id, route_id, name, departure_time, direction, target_grades, days_of_week, vehicle_id, created_at, updated_at");
    
    if (routeId) {
      query = query.eq("route_id", routeId);
    }

    const { data: schedules, error } = await query.order("departure_time", { ascending: true });

    if (error) {
      console.warn("Supabase schedules fetch error, falling back to mock:", error.message);
      let filtered = mockSchedules;
      if (routeId) {
        filtered = mockSchedules.filter(s => s.route_id === routeId);
      }
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: filtered });
    }

    return NextResponse.json({ success: true, source: "supabase", data: schedules || [] });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = scheduleCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      const newMockSchedule = {
        id: `sched-${Math.floor(Math.random() * 1000)}`,
        route_id: result.data.route_id,
        name: result.data.name,
        departure_time: result.data.departure_time,
        direction: result.data.direction,
        target_grades: result.data.target_grades,
        days_of_week: result.data.days_of_week,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockSchedule });
    }

    const client = getSupabaseClient(token);

    // Fetch tenant ID
    let tenantId = "8c9ad841-f762-4217-a021-9876251b5bcf";
    const { data: tenants } = await client.from("tenants").select("id").limit(1);
    if (tenants && tenants.length > 0) {
      tenantId = tenants[0].id;
    }

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      route_id: result.data.route_id,
      name: result.data.name,
      departure_time: result.data.departure_time,
      direction: result.data.direction,
      target_grades: result.data.target_grades,
      days_of_week: result.data.days_of_week,
      vehicle_id: result.data.vehicle_id || null,
    };

    const { data: scheduleInsert, error } = await client
      .from("schedules")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase schedule insert error, falling back to mock save:", error.message);
      const mockSchedule = {
        ...payload,
        id: `sched-db-fallback-${Math.floor(Math.random() * 1000)}`
      };
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: mockSchedule });
    }

    return NextResponse.json({ success: true, source: "supabase", data: scheduleInsert });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
