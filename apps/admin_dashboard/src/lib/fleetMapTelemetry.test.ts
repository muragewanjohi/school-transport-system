import { describe, expect, it } from "vitest";
import {
  classifyTelemetry,
  latestTelemetryByVehicle,
  parseTelemetryLatLng,
} from "@/lib/fleetMapTelemetry";

describe("parseTelemetryLatLng", () => {
  it("GeoJSON Point › longitude then latitude", () => {
    expect(
      parseTelemetryLatLng({ type: "Point", coordinates: [36.775623, -1.2062252] })
    ).toEqual({ lng: 36.775623, lat: -1.2062252 });
  });

  it("WKT POINT › longitude then latitude", () => {
    expect(parseTelemetryLatLng("POINT(36.775623 -1.2062252)")).toEqual({
      lng: 36.775623,
      lat: -1.2062252,
    });
  });
});

describe("latestTelemetryByVehicle", () => {
  it("two pings for one vehicle › keeps the newest row", () => {
    const rows = latestTelemetryByVehicle([
      {
        vehicle_id: "veh-1",
        coordinates: { coordinates: [36.77, -1.20] },
        speed: 0,
        created_at: "2026-08-14T15:19:00.000Z",
      },
      {
        vehicle_id: "veh-1",
        coordinates: { coordinates: [36.78, -1.21] },
        speed: 12,
        created_at: "2026-08-14T15:20:12.000Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speed).toBe(12);
    expect(rows[0].created_at).toBe("2026-08-14T15:20:12.000Z");
  });
});

describe("classifyTelemetry", () => {
  it("recent speed below 3 › stopped", () => {
    expect(
      classifyTelemetry({
        vehicle_id: "veh-1",
        coordinates: { coordinates: [36.77, -1.20] },
        speed: 2,
        created_at: new Date().toISOString(),
      })
    ).toBe("stopped");
  });
});
