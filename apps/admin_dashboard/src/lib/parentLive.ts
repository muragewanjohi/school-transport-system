export type ParentLivePoint = {
  lat: number;
  lng: number;
};

function parseEwkbPointHex(hex: string): ParentLivePoint | null {
  const clean = hex.replace(/^\\x/i, "").trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length < 42) return null;

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }

  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  let offset = 1;
  let type = view.getUint32(offset, littleEndian);
  offset += 4;

  // SRID flag (0x20000000)
  if ((type & 0x20000000) !== 0) {
    offset += 4;
    type = type & ~0x20000000;
  }
  // Only Point (type 1)
  if ((type & 0xff) !== 1) return null;
  if (offset + 16 > bytes.length) return null;

  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function parseLiveCoordinates(raw: unknown): ParentLivePoint | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const wkt = raw.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wkt) {
      const lng = Number(wkt[1]);
      const lat = Number(wkt[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    }
    return parseEwkbPointHex(raw);
  }

  if (typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const coords = record.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  return null;
}

export function childStopIdForDirection(
  direction: string | null | undefined,
  pickupStopId: string | null | undefined,
  dropoffStopId: string | null | undefined
): string | null {
  if (direction === "SCHOOL_TO_HOME") {
    return dropoffStopId || pickupStopId || null;
  }
  return pickupStopId || dropoffStopId || null;
}

export function isInProgressTrip(status: string | null | undefined): boolean {
  return (status ?? "").toString() === "in_progress";
}

function unwrapRelation(value: unknown): unknown {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function nestedName(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const name = (record as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function nestedPlate(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const plate = (record as Record<string, unknown>).license_plate;
  return typeof plate === "string" && plate.trim() ? plate.trim() : null;
}

export function nestedDirection(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const direction = (record as Record<string, unknown>).direction;
  return typeof direction === "string" && direction.trim() ? direction.trim() : null;
}
