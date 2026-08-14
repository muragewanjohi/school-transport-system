export type FleetTelemetryRow = {
  vehicle_id: string;
  route_id?: string;
  coordinates:
    | { type?: string; coordinates?: [number, number] | number[] }
    | string
    | null;
  speed: number | null;
  created_at: string;
};

export function parseTelemetryLatLng(
  coordinates: FleetTelemetryRow["coordinates"]
): { lat: number; lng: number } | null {
  if (!coordinates) return null;
  if (typeof coordinates === "string") {
    const match = coordinates.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (!match) return null;
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  const pair = coordinates.coordinates;
  if (!pair || pair.length < 2) return null;
  const lng = pair[0];
  const lat = pair[1];
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function latestTelemetryByVehicle(rows: FleetTelemetryRow[]): FleetTelemetryRow[] {
  const newest = new Map<string, FleetTelemetryRow>();
  for (const row of rows) {
    if (!row.vehicle_id) continue;
    const prev = newest.get(row.vehicle_id);
    if (!prev || Date.parse(row.created_at) >= Date.parse(prev.created_at)) {
      newest.set(row.vehicle_id, row);
    }
  }
  return [...newest.values()];
}

export function classifyTelemetry(
  row: FleetTelemetryRow,
  nowMs = Date.now()
): "moving" | "stopped" | "stale" {
  const ageMs = nowMs - Date.parse(row.created_at);
  if (!Number.isFinite(ageMs) || ageMs > 15 * 60 * 1000) return "stale";
  if ((row.speed ?? 0) >= 3) return "moving";
  return "stopped";
}
