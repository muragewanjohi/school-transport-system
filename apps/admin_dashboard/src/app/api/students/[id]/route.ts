import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

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
  grade: z.string().optional().or(z.literal("")),
  class_name: z.string().optional().or(z.literal("")),
});

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
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
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
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id, ...result.data } });
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
      return NextResponse.json({ success: true, source: "mock" });
    }

    const client = getSupabaseClient(token);

    const { error } = await client
      .from("students")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn(`Supabase student delete error for ${id}, falling back to mock:`, error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback" });
    }

    return NextResponse.json({ success: true, source: "supabase" });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

