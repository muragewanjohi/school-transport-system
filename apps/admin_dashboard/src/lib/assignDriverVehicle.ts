import type { SupabaseClient } from "@supabase/supabase-js";

export type DriverVehicleAssignment = {
  clearDriverId: string;
  setVehicleId: string | null;
  setDriverId: string;
};

/** Describes the two writes needed to move a driver onto a bus (or standby). */
export function driverVehicleAssignmentOps(
  driverId: string,
  vehicleId: string | null
): DriverVehicleAssignment {
  return {
    clearDriverId: driverId,
    setVehicleId: vehicleId,
    setDriverId: driverId,
  };
}

export async function assignDriverToVehicle(
  client: SupabaseClient,
  input: { tenantId: string; driverId: string; vehicleId: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tenantId, driverId, vehicleId } = input;
  const ops = driverVehicleAssignmentOps(driverId, vehicleId);

  const { data: driver } = await client
    .from("profiles")
    .select("id")
    .eq("id", driverId)
    .eq("tenant_id", tenantId)
    .eq("role", "driver")
    .maybeSingle();

  if (!driver) {
    return { ok: false, error: "Driver not found" };
  }

  if (ops.setVehicleId) {
    const { data: vehicle } = await client
      .from("vehicles")
      .select("id")
      .eq("id", ops.setVehicleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!vehicle) {
      return { ok: false, error: "Vehicle not found" };
    }
  }

  const { error: clearError } = await client
    .from("vehicles")
    .update({ active_driver_id: null })
    .eq("tenant_id", tenantId)
    .eq("active_driver_id", ops.clearDriverId);

  if (clearError) {
    return { ok: false, error: clearError.message };
  }

  if (!ops.setVehicleId) {
    return { ok: true };
  }

  const { data: updated, error: setError } = await client
    .from("vehicles")
    .update({ active_driver_id: ops.setDriverId })
    .eq("id", ops.setVehicleId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (setError) {
    return { ok: false, error: setError.message };
  }
  if (!updated) {
    return { ok: false, error: "Vehicle not found" };
  }

  return { ok: true };
}

export function emptyToNullVehicleId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}
