/** Today's Trips status override is per trip run, never after the trip is completed. */

export function isCompletedTripStatus(
  displayStatus?: string | null,
  tripStatus?: string | null
): boolean {
  if (tripStatus === "completed") return true;
  return displayStatus === "Completed";
}

export function canOverrideTodayTripStatus(input: {
  displayStatus?: string | null;
  tripStatus?: string | null;
}): boolean {
  return !isCompletedTripStatus(input.displayStatus, input.tripStatus);
}

/** Students on this daily trip: assigned to the schedule, not merely the corridor route. */
export function studentAssignedToTripSchedule(
  scheduleIds: unknown,
  scheduleId: string | null | undefined
): boolean {
  if (!scheduleId) return false;
  if (!Array.isArray(scheduleIds)) return false;
  return scheduleIds.some((id) => String(id) === scheduleId);
}
