export type StudentStopMode = "same" | "different";

export type RouteStopOption = {
  id: string;
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
  return routeStops[0]?.id || "";
}

export function defaultDifferentStopIds(routeStops: RouteStopOption[]): {
  pickup_stop_id: string;
  dropoff_stop_id: string;
} {
  const pickup = routeStops[0]?.id || "";
  const dropoff = routeStops[routeStops.length - 1]?.id || pickup;
  return { pickup_stop_id: pickup, dropoff_stop_id: dropoff };
}

export function filterStopsByName<T extends { name: string }>(
  stops: T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return stops;
  return stops.filter((stop) => stop.name.toLowerCase().includes(needle));
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
