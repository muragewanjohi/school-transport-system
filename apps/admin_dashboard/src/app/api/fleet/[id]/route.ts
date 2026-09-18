import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getLocalVehicles, saveLocalVehicles } from "@/lib/jsonDb";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { normalizeVehicleDate } from "@/lib/vehicleCompliance";
import { vehicleUpdateSchema } from "@/lib/vehicleFields";

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

    const normalized = {
      ...result.data,
      last_service_date:
        result.data.last_service_date !== undefined
          ? normalizeVehicleDate(result.data.last_service_date)
          : undefined,
      next_service_date:
        result.data.next_service_date !== undefined
          ? normalizeVehicleDate(result.data.next_service_date)
          : undefined,
      insurance_expiry:
        result.data.insurance_expiry !== undefined
          ? normalizeVehicleDate(result.data.insurance_expiry)
          : undefined,
    };

    if (!isSupabaseConfigured) {
      const vehicles = getLocalVehicles();
      const updatedVehicles = vehicles.map(v => {
        if (v.id === id) {
          return { ...v, ...normalized };
        }
        return v;
      });
      saveLocalVehicles(updatedVehicles);
      const updated = updatedVehicles.find(v => v.id === id) || { id, ...normalized };
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
      Object.entries(normalized).filter(([_, v]) => v !== undefined)
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
