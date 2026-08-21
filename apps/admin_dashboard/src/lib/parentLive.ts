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

/** Parent-facing child status from trip manifest attendance (preferred) or roster transit_status. */
export function parentChildStatusFromSources(input: {
  attendance?: string | null;
  transitStatus?: string | null;
  direction?: string | null;
  /** When false, never emit "On the Bus" (ignore boarded / stale roster strings). */
  tripActive?: boolean;
}): string {
  const tripActive = input.tripActive !== false;
  const idleByDirection =
    input.direction === "SCHOOL_TO_HOME" ? "At school" : "Waiting for pickup";

  if (!tripActive) {
    return idleByDirection;
  }

  const attendance = (input.attendance ?? "").toString().trim().toLowerCase();
  if (attendance === "boarded") return "On the Bus";
  if (attendance === "dropped_off") return "Dropped off";
  if (attendance === "absent" || attendance === "no_show") return "Absent";
  if (attendance === "pending") {
    return idleByDirection;
  }

  const transit = (input.transitStatus ?? "").toString().trim();
  if (!transit || transit.toLowerCase() === "pending") {
    return idleByDirection;
  }
  // Stale roster leftovers must not show as boarded without an active trip (already gated).
  if (/^on the bus$/i.test(transit) || /^boarded$/i.test(transit)) {
    return "On the Bus";
  }
  return transit;
}

export type ParentNextTripCandidate = {
  departure_time: string | null;
  custom_departure_time?: string | null;
  direction?: string | null;
  schedule_name?: string | null;
  vehicle_plate?: string | null;
  bus_number?: string | null;
  estimated_duration_minutes?: number | null;
};

export type ParentNextTripPayload = {
  departure_time: string;
  direction: string | null;
  schedule_name: string | null;
  vehicle_plate: string | null;
  bus_number: string | null;
  estimated_duration_minutes: number | null;
};

/** Prefer custom delay clock, else schedule departure; normalize to HH:MM for display. */
export function formatParentDepartureDisplay(
  customDeparture: string | null | undefined,
  scheduleDeparture: string | null | undefined
): string | null {
  const raw = (customDeparture?.trim() || scheduleDeparture?.trim() || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return raw;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes from midnight for sorting departure clocks (HH:MM or HH:MM:SS). */
export function departureMinutesFromMidnight(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

/** Pick earliest departure among candidates (already filtered to today). */
export function pickEarliestNextTrip(
  candidates: ParentNextTripCandidate[]
): ParentNextTripPayload | null {
  let best: ParentNextTripPayload | null = null;
  let bestMins = Number.POSITIVE_INFINITY;

  for (const row of candidates) {
    const display = formatParentDepartureDisplay(row.custom_departure_time, row.departure_time);
    if (!display) continue;
    const mins = departureMinutesFromMidnight(display);
    if (mins == null) continue;
    if (mins < bestMins) {
      bestMins = mins;
      best = {
        departure_time: display,
        direction: row.direction ?? null,
        schedule_name: row.schedule_name ?? null,
        vehicle_plate: row.vehicle_plate ?? null,
        bus_number: row.bus_number ?? null,
        estimated_duration_minutes:
          typeof row.estimated_duration_minutes === "number" &&
          Number.isFinite(row.estimated_duration_minutes)
            ? Math.max(0, Math.round(row.estimated_duration_minutes))
            : null,
      };
    }
  }
  return best;
}

/** Heuristic est. duration when schedule has no stored duration (driver trips pattern). */
export function estimateParentTripDurationMinutes(input: {
  stopCount?: number | null;
  studentCount?: number | null;
}): number {
  const stops = Math.max(0, input.stopCount ?? 0);
  const students = Math.max(0, input.studentCount ?? 0);
  return stops * 4 + 15 + students;
}

/** Nairobi weekday 0=Sun … 6=Sat matching JS getUTCDay after +3h shift for calendar. */
export function nairobiWeekday(now = new Date()): number {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return nairobi.getUTCDay();
}

export function nairobiTripDate(now = new Date()): string {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = nairobi.getUTCFullYear();
  const m = String(nairobi.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nairobi.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function scheduleRunsOnWeekday(
  daysOfWeek: unknown,
  weekday: number
): boolean {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) return true;
  return daysOfWeek.some((d) => Number(d) === weekday);
}

/** Minutes until arrival; null when missing or stale (already more than 2 minutes past). */
export function etaMinutesFromPredictedArrival(
  iso: string | null | undefined,
  now = new Date()
): number | null {
  if (!iso) return null;
  const arrivalMs = new Date(iso).getTime();
  if (!Number.isFinite(arrivalMs)) return null;
  const secs = Math.floor((arrivalMs - now.getTime()) / 1000);
  if (secs < -120) return null; // stale past ETA — do not show "Arriving"
  if (secs <= 0) return 0;
  return Math.ceil(secs / 60);
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

export function nestedBusNumber(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const bus = (record as Record<string, unknown>).bus_number;
  if (typeof bus === "string" && bus.trim()) return bus.trim();
  if (typeof bus === "number" && Number.isFinite(bus)) return String(bus);
  return null;
}

export function nestedPhone(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const phone = (record as Record<string, unknown>).phone;
  return typeof phone === "string" && phone.trim() ? phone.trim() : null;
}

export function nestedAvatarUrl(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const url = (record as Record<string, unknown>).avatar_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export type ParentCrewContact = {
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
};

/** Map a profiles join (or null) into a parent-facing crew contact. */
export function parentCrewContactFromProfile(value: unknown): ParentCrewContact | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const name = nestedName(record);
  const phone = nestedPhone(record);
  const avatar_url = nestedAvatarUrl(record);
  if (!name && !phone && !avatar_url) return null;
  return { name, phone, avatar_url };
}

export function nestedDirection(value: unknown): string | null {
  const record = unwrapRelation(value);
  if (!record || typeof record !== "object") return null;
  const direction = (record as Record<string, unknown>).direction;
  return typeof direction === "string" && direction.trim() ? direction.trim() : null;
}
