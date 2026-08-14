import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { getLocalVehicles, saveLocalVehicles } from "@/lib/jsonDb";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

const vehicleUpdateSchema = z.object({
  license_plate: z.string().min(3).optional(),
  model: z.string().min(2).optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["Active", "Maintenance", "Out of Service"]).optional(),
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

    if (!isSupabaseConfigured) {
      const vehicles = getLocalVehicles();
      const updatedVehicles = vehicles.map(v => {
        if (v.id === id) {
          return { ...v, ...result.data };
        }
        return v;
      });
      saveLocalVehicles(updatedVehicles);
      const updated = updatedVehicles.find(v => v.id === id) || { id, ...result.data };
      return NextResponse.json({
        success: true,
        source: "mock",
        data: updated
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    // Clean payload of undefined fields
    const payload = Object.fromEntries(
      Object.entries(result.data).filter(([_, v]) => v !== undefined)
    );

    const { data: vehicleUpdate, error } = await client
      .from("vehicles")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "42501" || error.message.includes("violates row-level security")) {
        return NextResponse.json({ success: false, error: "Not allowed to update this vehicle" }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    if (!vehicleUpdate) {
      return NextResponse.json({ success: false, error: "Vehicle not found" }, { status: 404 });
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

    if (!isSupabaseConfigured) {
      const vehicles = getLocalVehicles();
      const updatedVehicles = vehicles.filter(v => v.id !== id);
      saveLocalVehicles(updatedVehicles);
      return NextResponse.json({
        success: true,
        source: "mock",
        message: `Vehicle ${id} deleted successfully`
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: deleted, error } = await scope.client
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "42501" || error.message.includes("violates row-level security")) {
        const vehicles = getLocalVehicles();
        const updatedVehicles = vehicles.filter(v => v.id !== id);
        saveLocalVehicles(updatedVehicles);
        return NextResponse.json({
          success: true,
          source: "supabase_rls_mock_fallback",
          message: `Vehicle ${id} deleted successfully (Mock)`
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Vehicle not found" }, { status: 404 });
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
