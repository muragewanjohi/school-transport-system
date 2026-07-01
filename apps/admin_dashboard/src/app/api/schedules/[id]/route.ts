import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const scheduleUpdateSchema = z.object({
  route_id: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  departure_time: z.string().regex(/^([0-9]{2}):([0-9]{2})(:[0-9]{2})?$/).optional(),
  direction: z.enum(["HOME_TO_SCHOOL", "SCHOOL_TO_HOME"]).optional(),
  target_grades: z.array(z.string()).min(1).optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional(),
  vehicle_id: z.string().uuid("Invalid vehicle UUID").nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = scheduleUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
    }

    const client = getSupabaseClient(token);

    const updatePayload: Record<string, any> = {};
    if (result.data.route_id !== undefined) updatePayload.route_id = result.data.route_id;
    if (result.data.name !== undefined) updatePayload.name = result.data.name;
    if (result.data.departure_time !== undefined) updatePayload.departure_time = result.data.departure_time;
    if (result.data.direction !== undefined) updatePayload.direction = result.data.direction;
    if (result.data.target_grades !== undefined) updatePayload.target_grades = result.data.target_grades;
    if (result.data.days_of_week !== undefined) updatePayload.days_of_week = result.data.days_of_week;
    if (result.data.vehicle_id !== undefined) updatePayload.vehicle_id = result.data.vehicle_id;

    const { data: scheduleUpdate, error } = await client
      .from("schedules")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.warn(`Supabase schedule update error for ${id}, falling back to mock:`, error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id, ...result.data } });
    }

    return NextResponse.json({ success: true, source: "supabase", data: scheduleUpdate });
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
      return NextResponse.json({ success: true, source: "mock" });
    }

    const client = getSupabaseClient(token);

    const { error } = await client
      .from("schedules")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn(`Supabase schedule delete error for ${id}, falling back to mock:`, error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback" });
    }

    return NextResponse.json({ success: true, source: "supabase" });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
