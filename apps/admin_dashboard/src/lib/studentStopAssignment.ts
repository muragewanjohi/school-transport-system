export type StudentStopMode = "same" | "different";

export type RouteStopOption = {
  id: string;
  stop_type?: string;
};

export function inferStudentStopMode(pickupStopId: string, dropoffStopId: string): StudentStopMode {
  if (!pickupStopId && !dropoffStopId) return "same";
  if (pickupStopId && pickupStopId === dropoffStopId) return "same";
  return "different";
}

export function sameStageIds(stopId: string): { pickup_stop_id: string; dropoff_stop_id: string } {
  return { pickup_stop_id: stopId, dropoff_stop_id: stopId };
}

export function defaultSameStopId(routeStops: RouteStopOption[]): string {
  return (
    routeStops.find((s) => s.stop_type === "BOTH" || s.stop_type === "PICKUP")?.id ||
    routeStops[0]?.id ||
    ""
  );
}

export function defaultDifferentStopIds(routeStops: RouteStopOption[]): {
  pickup_stop_id: string;
  dropoff_stop_id: string;
} {
  const pickup =
    routeStops.find((s) => s.stop_type === "PICKUP" || s.stop_type === "BOTH")?.id ||
    routeStops[0]?.id ||
    "";
  const dropoff =
    routeStops.find((s) => s.stop_type === "DROPOFF" || s.stop_type === "BOTH")?.id ||
    routeStops[0]?.id ||
    "";
  return { pickup_stop_id: pickup, dropoff_stop_id: dropoff };
}

export function assignmentForNewRoute(
  previousPickupId: string | null | undefined,
  previousDropoffId: string | null | undefined,
  newRouteStops: RouteStopOption[]
): { pickup_stop_id: string; dropoff_stop_id: string; schedule_ids: string[] } {
  const mode = inferStudentStopMode(previousPickupId || "", previousDropoffId || "");
  if (mode === "same") {
    const stopId = defaultSameStopId(newRouteStops);
    return { pickup_stop_id: stopId, dropoff_stop_id: stopId, schedule_ids: [] };
  }
  const stops = defaultDifferentStopIds(newRouteStops);
  return { ...stops, schedule_ids: [] };
}
