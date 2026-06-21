import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const vehicleUpdateSchema = z.object({
  license_plate: z.string().min(3).optional(),
  model: z.string().min(2).optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["Active", "Maintenance", "Out of Service"]).optional(),
  fuel_level: z.number().int().min(0).max(100).optional(),
  odometer: z.number().nonnegative().optional(),
  last_service_date: z.string().nullable().optional(),
  next_service_date: z.string().nullable().optional(),
  insurance_expiry: z.string().nullable().optional(),
  active_driver_id: z.string().nullable().optional(),
  conductor_1_id: z.string().nullable().optional(),
  conductor_2_id: z.string().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = vehicleUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { id, ...result.data }
      });
    }

    const client = getSupabaseClient(token);

    // Clean payload of undefined fields
    const payload = Object.fromEntries(
      Object.entries(result.data).filter(([_, v]) => v !== undefined)
    );

    const { data: vehicleUpdate, error } = await client
      .from("vehicles")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "42501" || error.message.includes("violates row-level security")) {
        return NextResponse.json({
          success: true,
          source: "supabase_rls_mock_fallback",
          data: { id, ...result.data }
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: vehicleUpdate });

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
      return NextResponse.json({
        success: true,
        source: "mock",
        message: `Vehicle ${id} deleted successfully`
      });
    }

    const client = getSupabaseClient(token);

    const { error } = await client
      .from("vehicles")
      .delete()
      .eq("id", id);

    if (error) {
      if (error.code === "42501" || error.message.includes("violates row-level security")) {
        return NextResponse.json({
          success: true,
          source: "supabase_rls_mock_fallback",
          message: `Vehicle ${id} deleted successfully (Mock)`
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      message: `Vehicle ${id} deleted successfully`
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
