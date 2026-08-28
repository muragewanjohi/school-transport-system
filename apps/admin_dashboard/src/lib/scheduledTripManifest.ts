import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduledManifestSyncPlan = {
  addStudentIds: string[];
  removeStudentIds: string[];
};

export function utcTripDate(now = new Date()): string {
  return now.toISOString().split("T")[0];
}

/** Diff live schedule assignments against a snapped trip roster. */
export function scheduledManifestSyncPlan(input: {
  assignedStudentIds: string[];
  existingStudentIds: string[];
}): ScheduledManifestSyncPlan {
  const assigned = new Set(input.assignedStudentIds);
  const existing = new Set(input.existingStudentIds);
  return {
    addStudentIds: input.assignedStudentIds.filter((id) => !existing.has(id)),
    removeStudentIds: input.existingStudentIds.filter((id) => !assigned.has(id)),
  };
}

type StudentIdRow = { id: string };
type ManifestStudentRow = { student_id: string };
type ScheduledTripRow = { id: string; schedule_id: string; status?: string | null };

async function assignedStudentIdsForSchedule(
  client: SupabaseClient,
  tenantId: string,
  scheduleId: string
): Promise<string[] | null> {
  const { data, error } = await client
    .from("students")
    .select("id")
    .eq("tenant_id", tenantId)
    .contains("schedule_ids", [scheduleId]);
  if (error) {
    console.error("Failed to load students for manifest sync:", error.message);
    return null;
  }
  return ((data ?? []) as StudentIdRow[]).map((row) => row.id);
}

/** Keep a still-scheduled trip's roster aligned with current schedule_ids. */
export async function syncScheduledTripManifests(
  client: SupabaseClient,
  input: { tenantId: string; tripId: string; scheduleId: string }
): Promise<void> {
  const assignedStudentIds = await assignedStudentIdsForSchedule(
    client,
    input.tenantId,
    input.scheduleId
  );
  if (!assignedStudentIds) return;

  const { data: manifests, error: manifestsError } = await client
    .from("trip_manifests")
    .select("student_id")
    .eq("trip_id", input.tripId)
    .eq("tenant_id", input.tenantId);
  if (manifestsError) {
    console.error("Failed to load manifests for sync:", manifestsError.message);
    return;
  }

  const plan = scheduledManifestSyncPlan({
    assignedStudentIds,
    existingStudentIds: ((manifests ?? []) as ManifestStudentRow[]).map((row) => row.student_id),
  });

  if (plan.addStudentIds.length > 0) {
    const rows = plan.addStudentIds.map((studentId) => ({
      id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      trip_id: input.tripId,
      student_id: studentId,
      attendance: "pending",
    }));
    const { error } = await client.from("trip_manifests").insert(rows);
    if (error) {
      console.error("Failed to add assigned students to trip manifest:", error.message);
    }
  }

  if (plan.removeStudentIds.length > 0) {
    const { error } = await client
      .from("trip_manifests")
      .delete()
      .eq("trip_id", input.tripId)
      .eq("tenant_id", input.tenantId)
      .in("student_id", plan.removeStudentIds);
    if (error) {
      console.error("Failed to drop unassigned students from trip manifest:", error.message);
    }
  }
}

export async function syncScheduledTripIfNeeded(
  client: SupabaseClient,
  input: { tenantId: string; tripId: string; scheduleId: string; status: string | null | undefined }
): Promise<void> {
  if (input.status !== "scheduled") return;
  await syncScheduledTripManifests(client, {
    tenantId: input.tenantId,
    tripId: input.tripId,
    scheduleId: input.scheduleId,
  });
}

export async function syncTodayScheduledManifestsForSchedules(
  client: SupabaseClient,
  input: { tenantId: string; scheduleIds: string[]; tripDate?: string }
): Promise<void> {
  const unique = [...new Set(input.scheduleIds.filter(Boolean))];
  if (unique.length === 0) return;

  const { data: trips, error } = await client
    .from("trips")
    .select("id, schedule_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("trip_date", input.tripDate ?? utcTripDate())
    .eq("status", "scheduled")
    .in("schedule_id", unique);

  if (error) {
    console.error("Failed to load scheduled trips for manifest sync:", error.message);
    return;
  }

  for (const trip of (trips ?? []) as ScheduledTripRow[]) {
    await syncScheduledTripManifests(client, {
      tenantId: input.tenantId,
      tripId: trip.id,
      scheduleId: trip.schedule_id,
    });
  }
}
