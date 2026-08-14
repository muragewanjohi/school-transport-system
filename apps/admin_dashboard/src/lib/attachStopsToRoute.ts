export interface AttachableStop {
  id: string;
  route_id: string;
  name: string;
}

export interface NamedRoute {
  id: string;
  name: string;
}

export function stopsAvailableToAttach<T extends AttachableStop>(
  stops: T[],
  targetRouteId: string,
): T[] {
  if (!targetRouteId) return [];
  return stops.filter((stop) => stop.route_id !== targetRouteId);
}

export function orderedIdsAfterAttach(existingIds: string[], attachedIds: string[]): string[] {
  if (attachedIds.length === 0) return existingIds;
  if (existingIds.length >= 2) {
    const start = existingIds[0];
    const end = existingIds[existingIds.length - 1];
    const middle = existingIds.slice(1, -1);
    return [start, ...middle, ...attachedIds, end];
  }
  return [...existingIds, ...attachedIds];
}

export function parseStopCoordinates(location: unknown): { latitude: number; longitude: number } | null {
  if (location && typeof location === "object" && "coordinates" in location) {
    const coords = (location as { coordinates: unknown }).coordinates;
    if (
      Array.isArray(coords)
      && coords.length >= 2
      && typeof coords[0] === "number"
      && typeof coords[1] === "number"
    ) {
      return { longitude: coords[0], latitude: coords[1] };
    }
  }
  if (typeof location === "string") {
    const match = location.match(/POINT\(([^ ]+) ([^ ]+)\)/i);
    if (match) {
      const longitude = Number(match[1]);
      const latitude = Number(match[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }
  }
  return null;
}

export function groupStopsByRoute<T extends AttachableStop>(
  stops: T[],
  routes: NamedRoute[],
): Array<{ routeId: string; routeName: string; stops: T[] }> {
  const names = new Map(routes.map((route) => [route.id, route.name]));
  const groups = new Map<string, T[]>();
  for (const stop of stops) {
    const list = groups.get(stop.route_id) ?? [];
    list.push(stop);
    groups.set(stop.route_id, list);
  }
  return [...groups.entries()].map(([routeId, grouped]) => ({
    routeId,
    routeName: names.get(routeId) ?? "Other route",
    stops: grouped,
  }));
}
