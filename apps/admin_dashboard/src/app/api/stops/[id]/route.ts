import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const stopUpdateSchema = z.object({
  route_id: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  sequence_no: z.number().int().min(1).optional(),
  geofence_radius_meters: z.number().min(5).optional(),
  stop_type: z.enum(["PICKUP", "DROPOFF", "BOTH"]).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = stopUpdateSchema.safeParse(body);

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
    if (result.data.sequence_no !== undefined) updatePayload.sequence_no = result.data.sequence_no;
    if (result.data.geofence_radius_meters !== undefined) updatePayload.geofence_radius_meters = result.data.geofence_radius_meters;
    if (result.data.stop_type !== undefined) updatePayload.stop_type = result.data.stop_type;

    if (result.data.longitude !== undefined && result.data.latitude !== undefined) {
      updatePayload.location = `POINT(${result.data.longitude} ${result.data.latitude})`;
    }

    const { data: stopUpdate, error } = await client
      .from("stops")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.warn(`Supabase stop update error for ${id}, falling back to mock:`, error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id, ...result.data } });
    }

    return NextResponse.json({ success: true, source: "supabase", data: stopUpdate });
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
      .from("stops")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn(`Supabase stop delete error for ${id}, falling back to mock:`, error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback" });
    }

    return NextResponse.json({ success: true, source: "supabase" });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
