export type LocationSource = "school" | "custom";

export interface SchoolOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface EndpointDraft {
  source: LocationSource;
  schoolId: string;
  searchLocation: string;
  latitude: number;
  longitude: number;
}

export interface RouteStopLocation {
  name: string;
  latitude: number;
  longitude: number;
}

const COORD_EPSILON = 0.00015;

export function isMapVisible(source: LocationSource): boolean {
  return source === "custom";
}

export function needsSchoolDropdown(schools: SchoolOption[]): boolean {
  return schools.length > 1;
}

export function defaultSchoolId(schools: SchoolOption[]): string {
  return schools.length === 1 ? schools[0].id : "";
}

export function sameCoordinates(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): boolean {
  return Math.abs(a.latitude - b.latitude) < COORD_EPSILON
    && Math.abs(a.longitude - b.longitude) < COORD_EPSILON;
}

export function parseLocalSchoolLocations(raw: string | null): SchoolOption[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const latitude = typeof row.latitude === "number" ? row.latitude : Number.NaN;
      const longitude = typeof row.longitude === "number" ? row.longitude : Number.NaN;
      if (!id || name.length < 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }
      return [{ id, name, latitude, longitude }];
    });
  } catch {
    return [];
  }
}

export function mergeSchoolOptions(fromApi: SchoolOption[], fromLocal: SchoolOption[]): SchoolOption[] {
  const merged = [...fromApi];
  for (const loc of fromLocal) {
    const duplicate = merged.some(
      (school) => school.id === loc.id || sameCoordinates(school, loc),
    );
    if (!duplicate) merged.push(loc);
  }
  return merged;
}

export function resolveEndpointPayload(
  endpoint: EndpointDraft,
  schools: SchoolOption[],
  fallbackName: string,
): { ok: true; value: RouteStopLocation } | { ok: false; error: string } {
  if (endpoint.source === "school") {
    if (schools.length === 0) {
      return { ok: false, error: "No school location is configured." };
    }
    if (needsSchoolDropdown(schools) && !endpoint.schoolId) {
      return { ok: false, error: "Select a school." };
    }
    const school = schools.find((item) => item.id === endpoint.schoolId) ?? schools[0];
    if (!school) {
      return { ok: false, error: "Select a school." };
    }
    return {
      ok: true,
      value: {
        name: school.name,
        latitude: school.latitude,
        longitude: school.longitude,
      },
    };
  }

  if (!Number.isFinite(endpoint.latitude) || !Number.isFinite(endpoint.longitude)) {
    return { ok: false, error: "Pick a location on the map." };
  }
  const name = endpoint.searchLocation.trim() || fallbackName;
  if (name.length < 2) {
    return { ok: false, error: "Search or drop a pin to set this location." };
  }
  return {
    ok: true,
    value: {
      name,
      latitude: endpoint.latitude,
      longitude: endpoint.longitude,
    },
  };
}

export function inferEndpointFromStop(
  stop: { name: string; latitude: number; longitude: number } | null,
  schools: SchoolOption[],
  fallback: EndpointDraft,
): EndpointDraft {
  if (!stop) return fallback;
  const match = schools.find(
    (school) =>
      sameCoordinates(school, stop) || school.name.trim().toLowerCase() === stop.name.trim().toLowerCase(),
  );
  if (match) {
    return {
      source: "school",
      schoolId: match.id,
      searchLocation: match.name,
      latitude: match.latitude,
      longitude: match.longitude,
    };
  }
  return {
    source: "custom",
    schoolId: fallback.schoolId,
    searchLocation: stop.name,
    latitude: stop.latitude,
    longitude: stop.longitude,
  };
}
