import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { assignDriverToVehicle, emptyToNullVehicleId } from "@/lib/assignDriverVehicle";

const driverUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z.string().min(5, "Phone number too short").optional(),
  email: z.string().email("Invalid email format").optional(),
  national_id: z.string().min(4, "National ID must be at least 4 characters").optional(),
  status: z.enum(["Available", "Unavailable"]).optional(),
  avatar_url: z.string().optional().nullable(),
  vehicle_id: z.string().min(1).nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = driverUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { vehicle_id: vehicleIdRaw, ...profileFields } = result.data;
    const profilePatch = Object.fromEntries(
      Object.entries(profileFields).filter(([, value]) => value !== undefined)
    );

    let driverUpdate: Record<string, unknown> | null = null;

    if (Object.keys(profilePatch).length > 0) {
      const { data, error } = await scope.client
        .from("profiles")
        .update(profilePatch)
        .eq("id", id)
        .eq("tenant_id", scope.tenantId)
        .eq("role", "driver")
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ success: false, error: "Driver not found" }, { status: 404 });
      }
      driverUpdate = data as Record<string, unknown>;
    }

    if (vehicleIdRaw !== undefined) {
      const assigned = await assignDriverToVehicle(scope.client, {
        tenantId: scope.tenantId,
        driverId: id,
        vehicleId: emptyToNullVehicleId(vehicleIdRaw),
      });
      if (!assigned.ok) {
        return NextResponse.json({ success: false, error: assigned.error }, { status: 400 });
      }
    }

    if (!driverUpdate && vehicleIdRaw === undefined) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: driverUpdate ?? { id, vehicle_id: emptyToNullVehicleId(vehicleIdRaw) },
    });

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
      return NextResponse.json({ success: true, source: "mock", data: { id } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: deleted, error } = await scope.client
      .from("profiles")
      .delete()
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .eq("role", "driver")
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Supabase driver delete error, falling back to mock:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id } });
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Driver not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: { id } });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
